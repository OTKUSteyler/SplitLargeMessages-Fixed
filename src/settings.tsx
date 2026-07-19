import { findByProps } from "@vendetta/metro";
import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";

const Forms = findByProps("FormSwitchRow", "FormSection");

export default function Settings() {
    useProxy(storage);

    if (!Forms) return null;

    const { FormSwitchRow, FormSection } = Forms;

    return (
        <FormSection title="Split Large Messages">
            <FormSwitchRow
                label="Split on words"
                subLabel="Split on word boundaries instead of newlines when a single line exceeds the limit"
                value={storage.splitOnWords}
                onValueChange={(v: boolean) => (storage.splitOnWords = v)}
            />
        </FormSection>
    );
}
