import some from 'lodash/some'
import { EventEmitter } from 'events'
const GistClient = require("gist-client")
import { StorexHubApi_v0, StorexHubCallbacks_v0 } from '@worldbrain/storex-hub/lib/public-api'
import { StorageOperationChangeInfo } from '@worldbrain/storex-middleware-change-watcher/lib/types'
import { Tag } from '@worldbrain/memex-storex-hub/lib/types'
import { StorageData, TagsByPage } from './types'
import { SHARE_TAG_NAME, APP_NAME } from './constants'
import { SettingsManager } from './settings'
import { PageArchiver } from './page-archiver'

type Logger = (...args: any[]) => void
export class Application {
    events = new EventEmitter()

    private _client?: StorexHubApi_v0
    private logger: Logger
    private settingsManager: SettingsManager

    get client() {
        if (!this._client) {
            throw new Error(`Tried to acces this.client, but it's not set up yet`)
        }
        return this._client
    }

    constructor(private options: {
        settingsManager: SettingsManager
        pageArchiver: PageArchiver
        logger?: Logger
    }) {
        this.settingsManager = options.settingsManager
        this.logger = options.logger || console.log.bind(console)
    }

    async setup(createClient: (options: {
        callbacks: StorexHubCallbacks_v0
    }) => Promise<StorexHubApi_v0>) {
        await this.settingsManager.loadSettings()

        this._client = await createClient({
            callbacks: {
                handleEvent: async ({ event }) => {
                    if (event.type === 'storage-change' && event.app === 'memex') {
                        this.handleMemexStorageChange(event.info)
                    }
                    else if (event.type === 'app-availability-changed' && event.app === 'memex') {
                        this.logger('Changed Memex availability:', event.availability ? 'up' : 'down')
                        if (event.availability) {
                            this.tryToSubscribeToMemex()
                        }
                    }
                },
            },
        })
    }

    async handleMemexStorageChange(info: StorageOperationChangeInfo<'post'>) {
        const hasInterestingChange = some(info.changes, change => change.collection === 'tags')
        if (!hasInterestingChange) {
            return
        }
        this.logger('Detected change to Memex tags')
        const data = await this.fetchStorageData()
        const archivedPages = await this.settingsManager.getSetting('archivedPages')
        for (const page of data.pages) {
            if (!archivedPages[page.url]) {
                archivedPages[page.url] = await this.options.pageArchiver.archivePage(page)
            }
        }
        await this.settingsManager.setSetting('archivedPages', archivedPages)
        await this.settingsManager.saveSettings()
        this.events.emit('synced')
    }

    async fetchStorageData(): Promise<StorageData> {
        const tagsResponse = await this.client!.executeRemoteOperation({
            app: 'memex',
            operation: ['findObjects', 'tags', { name: SHARE_TAG_NAME }]
        })
        if (tagsResponse.status !== 'success') {
            throw new Error(`Error while fetching URLs for tag '${SHARE_TAG_NAME}'`)
        }

        const pageUrls = (tagsResponse.result as Array<Tag>).map(tag => tag.url)
        const pageTagsResponse = await this.client.executeRemoteOperation({
            app: 'memex',
            operation: ['findObjects', 'tags', { url: { $in: pageUrls } }]
        })
        if (pageTagsResponse.status !== 'success') {
            throw new Error(`Error while all tags for shared pages`)
        }

        const pagesRespone = await this.client.executeRemoteOperation({
            app: 'memex',
            operation: ['findObjects', 'pages', { url: { $in: pageUrls } }]
        })
        if (pagesRespone.status !== 'success') {
            throw new Error(`Error while fetching info for tagged pages from Memex`)
        }

        const tagsByPage: TagsByPage = {}
        for (const tag of pageTagsResponse.result) {
            tagsByPage[tag.url] = tagsByPage[tag.url] || []
            tagsByPage[tag.url].push(tag.name)
        }

        return { tagsByPage, pages: pagesRespone.result }
    }

    async registerOrIdentify() {
        this.logger(`Identifying with Storex Hub as '${APP_NAME}'`)
        const accessToken = this.settingsManager.settings?.['accessToken']
        if (accessToken) {
            const identificationResult = await this.client.identifyApp({
                name: APP_NAME,
                accessToken
            })
            if (identificationResult.status !== 'success') {
                throw new Error(`Couldn't identify app '${APP_NAME}': ${identificationResult.status}`)
            }
        }
        else {
            const registrationResult = await this.client.registerApp({
                name: APP_NAME,
                identify: true,
            })
            if (registrationResult.status === 'success') {
                const accessToken = registrationResult.accessToken
                this.settingsManager.setSetting('accessToken', accessToken)
                await this.settingsManager.saveSettings()
            }
            else {
                throw new Error(`Couldn't register app '${APP_NAME}'": ${registrationResult.status}`)
            }
        }
        this.logger(`Successfuly identified with Storex Hub as '${APP_NAME}'`)
    }

    async tryToSubscribeToMemex() {
        const subscriptionResult = await this.client.subscribeToEvent({
            request: {
                type: 'storage-change',
                app: 'memex',
                collections: ['tags'],
            }
        })
        if (subscriptionResult.status === 'success') {
            this.logger('Successfuly subscribed to Memex storage changes')
        }
        else {
            this.logger('Could not subscribe to Memex storage changes (yet?):', subscriptionResult.status)
        }
    }

    async initializeSession() {
        await this.registerOrIdentify()
        await this.tryToSubscribeToMemex()
        await this.client.subscribeToEvent({
            request: {
                type: 'app-availability-changed'
            }
        })
    }
}
