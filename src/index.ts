import { findByProps, findByStoreName } from "@vendetta/metro";
import { before, instead } from "@vendetta/patcher";
import { storage } from "@vendetta/plugin";
import { getAssetIDByName } from "@vendetta/ui/assets";
import { showToast } from "@vendetta/ui/toasts";
import settings from "./settings";

storage.splitOnWords ??= false;

let unpatch: (() => boolean) | undefined;
let unpatchAlert: (() => boolean) | undefined;

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
        console.log("[SLM] onLoad start");

        const ChannelStore = findByStoreName("ChannelStore");
        const MessageActions = findByProps("sendMessage", "editMessage");
        const Constants = findByProps("MAX_MESSAGE_LENGTH");
        const UserStore = findByStoreName("UserStore");
        const Alerts = findByProps("show", "close", "openLazy");

        console.log("[SLM] ChannelStore found:", !!ChannelStore);
        console.log("[SLM] MessageActions found:", !!MessageActions);
        console.log("[SLM] Constants found:", !!Constants);
        console.log("[SLM] UserStore found:", !!UserStore);
        console.log("[SLM] Alerts found:", !!Alerts);

        if (Constants) {
            const desc = Object.getOwnPropertyDescriptor(Constants, "MAX_MESSAGE_LENGTH");
            console.log("[SLM] MAX_MESSAGE_LENGTH descriptor before:", JSON.stringify(desc));
            console.log("[SLM] Constants frozen?", Object.isFrozen(Constants));

            try {
                Object.defineProperty(Constants, "MAX_MESSAGE_LENGTH", { value: 2 ** 30, writable: true, configurable: true });
                Object.defineProperty(Constants, "MAX_MESSAGE_LENGTH_PREMIUM", { value: 2 ** 30, writable: true, configurable: true });
                console.log("[SLM] defineProperty override succeeded");
            } catch (e) {
                console.log("[SLM] defineProperty override FAILED:", e);
            }

            console.log("[SLM] MAX_MESSAGE_LENGTH after override:", Constants.MAX_MESSAGE_LENGTH);
            console.log("[SLM] MAX_MESSAGE_LENGTH_PREMIUM after override:", Constants.MAX_MESSAGE_LENGTH_PREMIUM);
        }

        unpatch?.();
        unpatch = before("sendMessage", MessageActions, args => {
            console.log("[SLM] sendMessage patch fired, args[1]:", JSON.stringify(args[1]));

            const [channelId, message] = args;
            const content: string | undefined = message?.content;
            const maxLength = UserStore.getCurrentUser()?.premiumType === 2 ? 4000 : 2000;

            console.log("[SLM] content length:", content?.length, "maxLength:", maxLength);

            if (!content || content.length < maxLength) {
                console.log("[SLM] under maxLength, letting sendMessage through unmodified");
                return;
            }

            const chunks = intoChunks(content, maxLength);
            console.log("[SLM] chunk count:", chunks ? chunks.length : "FAILED TO CHUNK");

            if (!chunks) {
                message.content = "";
                showToast("Failed to split message", getAssetIDByName("Small"));
                return;
            }

            message.content = chunks.shift()!;
            const channel = ChannelStore.getChannel(channelId);
            const delay = Math.max((channel?.rateLimitPerUser ?? 0) * 1000, 1000);
            console.log("[SLM] first chunk sent inline, remaining:", chunks.length, "delay:", delay);

            (async () => {
                for (const chunk of chunks) {
                    await sleep(delay);
                    console.log("[SLM] sending chunk of length", chunk.length);
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
                console.log("[SLM] all chunks sent");
            })();
        });

        if (Alerts) {
            unpatchAlert = instead("show", Alerts, (args, orig) => {
                console.log("[SLM] Alerts.show called with:", JSON.stringify(args[0], null, 2));
                return orig(...args);
            });
        }

        console.log("[SLM] onLoad complete");
    },
    onUnload: () => {
        console.log("[SLM] onUnload");
        unpatch?.();
        unpatchAlert?.();
        const Constants = findByProps("MAX_MESSAGE_LENGTH");
        Constants.MAX_MESSAGE_LENGTH = 2000;
        Constants.MAX_MESSAGE_LENGTH_PREMIUM = 4000;
    },
    settings,
};
