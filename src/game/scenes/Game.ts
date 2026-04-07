import { Scene } from "phaser";

export class Game extends Scene {
	camera: Phaser.Cameras.Scene2D.Camera;
	background: Phaser.GameObjects.Image;
	gameText: Phaser.GameObjects.Text;
	letterTimer: Phaser.Time.TimerEvent;

	fallingTexts: Phaser.GameObjects.Text[] = [];

	constructor() {
		super("Game");
	}

	create() {
		this.camera = this.cameras.main;
		this.camera.setBackgroundColor(0xf5f0e8);

		this.letterTimer = this.time.addEvent({
			callback: this.timerEvent,
			callbackScope: this,
			delay: 5000,
			loop: true,
		});
		this.timerEvent();

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

	public timerEvent(): void {
		console.log("timer");
		const text = this.add.text(512, 200, "text", {
			fontFamily: "Georgia",
			fontSize: 24,
			color: "#4a4a4a",
			align: "center",
		})
			.setOrigin(0.5)
			.setDepth(200);

		this.matter.add.gameObject(text);

		this.fallingTexts.push(text);
	}
}
