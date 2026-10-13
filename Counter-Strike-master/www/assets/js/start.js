import {Game} from "./Game.js";
import {HUD} from "./Hud.js";
import {Control} from "./Control.js";
import {World} from "./World.js";
import Stats from "../threejs/Stats.js";
import {Setting} from "./Setting.js";
import {PlayerAction} from "./PlayerAction.js";
import {PointerLockControls} from "three/addons/controls/PointerLockControls.js";

let launchGame
(function () {

////////////

    const validMaps = ['default']
    let initialized = false, statsLocal = null
    const world = new World()
    const hud = new HUD()
    const stats = new Stats()
    const game = new Game(world, hud, stats)
    const action = new PlayerAction(game, hud)
    const control = new Control(game, action)
    hud.injectDependency(game)

////////////


    launchGame = async function (canvasParent, elementHud, settingString, joinUrl) {
        if (initialized) {
            throw new Error("Game already launched")
        }
        initialized = true

        let connector
        let url
        try {
            url = new URL(joinUrl)
        } catch (e) {
            url = new URL('local://practice?map=default&code=practice')
        }

        if (url.protocol === 'ws:' || url.protocol === 'wss:') {
            const ns = await import("./WebSocketConnector.js")
            connector = new ns.WebSocketConnector(game)
        } else if (url.protocol === 'udp:') {
            const ns = await import("./UdpSocketConnector.js")
            connector = new ns.UdpSocketConnector(game)
            url = new URL(joinUrl.replace('udp://', 'https://')) // URL do not parse udp parts well, so do https instead
        } else if (url.protocol === 'peer:' || url.protocol === 'local:' || url.protocol === 'p2p:' || url.protocol === 'http:' || url.protocol === 'https:') {
            const ns = await import("./LocalSimulatorConnector.js")
            connector = new ns.LocalSimulatorConnector(game, joinUrl)
        } else {
            const ns = await import("./LocalSimulatorConnector.js")
            connector = new ns.LocalSimulatorConnector(game, joinUrl)
        }

        const loginCode = url.searchParams.get('code') || 'practice'
        const map = url.searchParams.get('map') || 'default'
        if (!validMaps.includes(map)) {
            throw new Error("Invalid map given")
        }

        const setting = new Setting(settingString)
        const canvas = await world.init(map, setting)
        const pointerLock = new PointerLockControls(world.getCamera(), canvasParent)
        pointerLock.pointerSpeed = setting.getSensitivity()

        hud.createHud(elementHud, map, setting)
        control.init(canvasParent, pointerLock, setting)
        game.setDependency(pointerLock, setting, action)
        canvas.addEventListener("click", () => game.requestPointerLock())
        canvasParent.appendChild(canvas)
        if (setting.shouldShowFps()) {
            stats.dom.style.position = 'inherit'
            elementHud.querySelector('#fps-stats').appendChild(stats.dom)
        }

        game.onEnd(function (msg) {
            connector.close()
            hud.showScore()
            alert("Game ended: " + msg)
            window.location.reload()
        })
        game.onReady(function () {
            if (!setting.shouldMatchServerFps()) {
                if (setting.shouldShowFps()) {
                    statsLocal = new Stats()
                    statsLocal.dom.style.position = 'inherit'
                    elementHud.querySelector('#fps-stats').appendChild(statsLocal.dom)
                }
                render()
            }
        })

        setting.addUpdateCallback('sensitivity', (newValue) => pointerLock.pointerSpeed = parseFloat(newValue))
        setting.addUpdateCallback('volume', (newValue) => world.volume = parseFloat(newValue))
        connector.connect(url.hostname, url.port, loginCode, control)
        window.addEventListener('beforeunload', () => connector.close());
    }

    function render() {
        statsLocal && statsLocal.begin()
        world.render()
        statsLocal && statsLocal.end()
        requestAnimationFrame(render)
    }

})()

export {
    launchGame
}
