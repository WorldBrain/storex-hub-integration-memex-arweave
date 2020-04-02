import expect from 'expect'
import { createMultiApiTestFactory, TestSetup, MultiApiOptions } from '@worldbrain/storex-hub/lib/tests/api/index.tests'
import { MemexTestingApp } from '@worldbrain/memex-storex-hub/lib/testing'
import { Tag, Page } from '@worldbrain/memex-storex-hub/lib/types/storex-types'
import { Application } from "./application"
import { MemorySettingsStore, SettingsManager } from './settings'
import { MemoryPageArchiver } from './page-archiver'
import { SHARE_TAG_NAME } from './constants'
import { Settings } from './types'

describe('Memex Gist Sharer', () => {
    const it = createMultiApiTestFactory()

    async function setupTest(testOptions: {
        createSession: TestSetup<MultiApiOptions>['createSession']
        settings?: Settings
    }) {
        const memex = new MemexTestingApp(options => testOptions.createSession({ type: 'websocket', ...options }))
        await memex.connect()

        const settingsStore = new MemorySettingsStore(testOptions.settings)
        const settingsManager = new SettingsManager(settingsStore)
        const pageArchiver = new MemoryPageArchiver()
        const sharer = new Application({ settingsManager, pageArchiver })
        await sharer.setup(async ({ callbacks }) => {
            const session = await testOptions.createSession({ type: 'websocket', callbacks })
            return session.api
        })
        await sharer.initializeSession()

        return { sharer, settingsStore, pageArchiver }
    }

    it('should work', async ({ createSession }) => {
        const { sharer, pageArchiver } = await setupTest({ createSession })
        let waitForSync = new Promise((resolve, reject) => {
            sharer.events.once('synced', resolve)
        })

        const page: Page = {
            fullUrl: 'https://www.bla.com/foo',
            fullTitle: 'bla.com: Foo',
            url: 'bla.com/foo',
            domain: 'www.bla.com',
            hostname: 'bla.com'
        }
        await sharer.client.executeRemoteOperation({
            app: 'memex',
            operation: ['createObject', 'pages', page]
        })
        const firstTag: Tag = { name: SHARE_TAG_NAME, url: 'bla.com/foo' }
        await sharer.client.executeRemoteOperation({
            app: 'memex',
            operation: ['createObject', 'tags', firstTag]
        })

        await waitForSync
        expect(pageArchiver.archived).toEqual([expect.objectContaining(page)])

        waitForSync = new Promise((resolve, reject) => {
            sharer.events.once('synced', resolve)
        })
        const secondTag: Tag = { name: 'foo', url: 'bla.com/foo' }
        await sharer.client.executeRemoteOperation({
            app: 'memex',
            operation: ['createObject', 'tags', secondTag]
        })

        await waitForSync
        expect(pageArchiver.archived).toEqual([expect.objectContaining(page)])
    })
})
