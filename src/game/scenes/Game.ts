import { Scene } from "phaser";

export class Game extends Scene {
	camera: Phaser.Cameras.Scene2D.Camera;
	background: Phaser.GameObjects.Image;
	gameText: Phaser.GameObjects.Text;

	constructor() {
		super("Game");
	}

	create() {
		this.camera = this.cameras.main;
		this.camera.setBackgroundColor(0xf5f0e8);

		this.gameText = this.add
			.text(
				512,
				384,
				"Make something fun!\nand share it with us:\nsupport@phaser.io",
				{
					fontFamily: "Georgia",
					fontSize: 38,
					color: "#4a4a4a",
					align: "center",
				},
			)
			.setOrigin(0.5)
			.setDepth(100);
	}
}
