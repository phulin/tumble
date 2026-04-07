import { AUTO, Game } from "phaser";
import { Game as MainGame } from "./scenes/Game";

//  Find out more information about the Game Config at:
//  https://docs.phaser.io/api-documentation/typedef/types-core#gameconfig
const config: Phaser.Types.Core.GameConfig = {
	type: AUTO,
	width: window.innerWidth,
	height: window.innerHeight,
	scale: {
		mode: Phaser.Scale.RESIZE,
		autoCenter: Phaser.Scale.CENTER_BOTH,
	},
	physics: {
		default: "matter",
		matter: {
			gravity: { x: 0, y: 1 },
			debug: import.meta.env.DEV,
		},
	},
	parent: "game-container",
	backgroundColor: "#f5f0e8",
	scene: MainGame,
};

const StartGame = (parent: string) => {
	return new Game({ ...config, parent });
};

export default StartGame;
