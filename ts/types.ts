import { Page } from "@worldbrain/memex-storex-hub/lib/types";

export interface Settings {
    accessToken?: string
    arweaveKey?: any
    archivedPages: { [url: string]: ArchivedPage }
}

export interface ArchivedPage {

}

export interface SettingsStore {
    loadSettings(): Promise<Partial<Settings>>
    saveSettings(settings: Settings): Promise<void>
}

export type TagsByPage = {
    [url: string]: Array<string>
}
export interface StorageData {
    pages: Page[]
    tagsByPage: TagsByPage
}
