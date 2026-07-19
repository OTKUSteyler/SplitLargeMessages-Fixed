import { storage } from "@vendetta/plugin";
import { useProxy } from "@vendetta/storage";
import { General } from "@vendetta/ui/components";

const { FormSwitchRow, FormSection } = General.Forms;

export default function Settings() {
    useProxy(storage);

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
