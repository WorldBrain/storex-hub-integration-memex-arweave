import { writeFileSync, existsSync, readFileSync } from "fs";
import { SettingsStore, Settings } from "./types";

export class SettingsManager {
    settings?: Settings

    constructor(private store: SettingsStore, private defaultValues?: Partial<Settings>) {
    }

    async getSetting<Key extends keyof Settings>(key: Key): Promise<Settings[Key]> {
        const settings = await this.getSettings()
        return settings[key]
    }

    async setSetting<Key extends keyof Settings>(key: Key, value: Settings[Key]) {
        const settings = await this.getSettings()
        settings[key] = value
    }

    async getSettings(): Promise<Settings> {
        return this.settings ? this.settings : this.loadSettings()
    }

    async loadSettings(): Promise<Settings> {
        const loaded = await this.store.loadSettings()
        this.settings = {
            ...loaded,
            archivedPages: loaded.archivedPages || {}
        }
        return this.settings
    }

    async saveSettings() {
        if (this.settings) {
            await this.store.saveSettings(this.settings)
        }
    }
}

export class FileSettingsStore implements SettingsStore {
    constructor(private path: string) {
    }

    async loadSettings(): Promise<Partial<Settings>> {
        const hasConfig = existsSync(this.path)
        const existingConfig = hasConfig ? JSON.parse(readFileSync(this.path).toString()) : null
        return existingConfig || {}
    }

    async saveSettings(settings: Settings) {
        writeFileSync(this.path, JSON.stringify(settings))
    }
}

export class MemorySettingsStore implements SettingsStore {
    constructor(public settings?: Settings) {
    }

    async loadSettings(): Promise<Partial<Settings>> {
        return this.settings || {}
    }

    async saveSettings(settings: Settings) {
        this.settings = settings
    }
}
