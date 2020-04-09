import Arweave from 'arweave/node';
import { JWKInterface } from 'arweave/node/lib/wallet';
import { Page } from '@worldbrain/memex-storex-hub/lib/types'
import { ArchivedPage } from "./types";
import { SettingsManager } from './settings';

export interface PageArchiver {
    archivePage(page: Page): Promise<ArchivedPage>
}

export class ArweavePageArchiver implements PageArchiver {
    arweave: Arweave
    key?: JWKInterface

    constructor(private options: {
        settingsManager: SettingsManager
    }) {
        // this.arweave = Arweave.init({
        //     host: '127.0.0.1',
        //     port: 1984,
        //     protocol: 'http'
        // });
        this.arweave = Arweave.init({
            host: 'arweave.net',// Hostname or IP address for a Arweave host
            port: 443,          // Port
            protocol: 'https',  // Network protocol http or https
            timeout: 20000,     // Network request timeouts in milliseconds
            logging: false,     // Enable network request logging
        })
    }

    async setup() {
        const existingKey = await this.options.settingsManager.getSetting('arweaveKey')
        if (existingKey) {
            this.key = existingKey
            return
        }

        this.key = await this.arweave.wallets.generate()
        await this.options.settingsManager.setSetting('arweaveKey', this.key)
        await this.options.settingsManager.saveSettings()
    }

    async archivePage(page: Page) {
        const dataToSend = JSON.stringify(page)
        const transaction = await this.arweave.createTransaction({ data: dataToSend }, this.key!)
        await this.arweave.transactions.sign(transaction, this.key!)
        await this.arweave.transactions.post(transaction)
        console.log('Page archived to Arweave:')
        console.log('- URL:', page.fullUrl)
        console.log('- Transaction:', transaction.id)

        return { txid: transaction.id }
    }
}

export class MemoryPageArchiver implements PageArchiver {
    archived: Page[] = []

    async archivePage(page: Page) {
        this.archived.push(page)
        return {}
    }
}