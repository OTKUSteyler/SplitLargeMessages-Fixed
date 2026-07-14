import { findByProps, findByStoreName } from "@vendetta/metro";
import { before } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import settings from "./settings";

storage.splitOnWords ??= false;

let unpatch: (() => boolean) | undefined;

function sleep(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

function intoChunks(content: string, maxChunkLength: number): string[] | false {
    const build = (parts: string[], sep: string) => {
        const chunks: string[] = [];
        let current = "";
        for (const part of parts) {
            if (current.length + part.length + sep.length > maxChunkLength) {
                if (current) chunks.push(current);
                current = part;
            } else {
                current = current ? current + sep + part : part;
            }
        }
        if (current) chunks.push(current);
        return chunks;
    };

    if (!storage.splitOnWords) {
        const chunks = build(content.split("\n"), "\n");
        if (chunks.length && !chunks.some(c => c.length > maxChunkLength))
            return chunks.map(c => c.trim());
    }

    const chunks = build(content.split(" "), " ");
    if (!chunks.length || chunks.some(c => c.length > maxChunkLength)) return false;
    return chunks.map(c => c.trim());
}

export default {
    onLoad() {
        const ChannelStore = findByStoreName("ChannelStore");
        const MessageActions = findByProps("sendMessage", "editMessage");
        const Constants = findByProps("MAX_MESSAGE_LENGTH");
        const UserStore = findByStoreName("UserStore");

        Constants.MAX_MESSAGE_LENGTH = 2 ** 30;
        Constants.MAX_MESSAGE_LENGTH_PREMIUM = 2 ** 30;

        unpatch?.();
        unpatch = before("sendMessage", MessageActions, args => {
            const [channelId, message] = args;
            const content: string | undefined = message?.content;
            const maxLength = UserStore.getCurrentUser()?.premiumType === 2 ? 4000 : 2000;

            if (!content || content.length < maxLength) return;

            const chunks = intoChunks(content, maxLength);
            if (!chunks) {
                message.content = "";
                showToast("Failed to split message", getAssetIDByName("Small"));
                return;
            }

            message.content = chunks.shift()!;
            const channel = ChannelStore.getChannel(channelId);
            const delay = Math.max((channel?.rateLimitPerUser ?? 0) * 1000, 1000);

            (async () => {
                for (const chunk of chunks) {
                    await sleep(delay);
                    await MessageActions._sendMessage(
                        channelId,
                        {
                            invalidEmojis: message.invalidEmojis,
                            validNonShortcutEmojis: message.validNonShortcutEmojis,
                            tts: false,
                            content: chunk,
                        },
                        {}
                    );
                }
            })();
        });
    },
    onUnload: () => {
        unpatch?.();
        const Constants = findByProps("MAX_MESSAGE_LENGTH");
        Constants.MAX_MESSAGE_LENGTH = 2000;
        Constants.MAX_MESSAGE_LENGTH_PREMIUM = 4000;
    },
    settings,
};
