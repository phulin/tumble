import { Scene } from "phaser";

const LETTER_BAG = "EEEEEEEEEAAAAAARRRRIIIIOOOTTNNNSSSLLDDGGBCMPFHKUVWY";

export class Game extends Scene {
	camera: Phaser.Cameras.Scene2D.Camera;
	background: Phaser.GameObjects.Image;
	gameText: Phaser.GameObjects.Text;
	letterTimer: Phaser.Time.TimerEvent;

	nextLetter: Phaser.GameObjects.Text;
	fallingTexts: Phaser.GameObjects.Text[] = [];

	constructor() {
		super("Game");
	}

	create() {
		this.camera = this.cameras.main;
		this.camera.setBackgroundColor(0xf5f0e8);

		this.createNextLetter();

		this.input.on("pointerup", () => this.dropNextLetter());
		this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
			this.nextLetter.x = pointer.x;
		});
	}

	public createNextLetter() {
		const letter = LETTER_BAG[Math.floor(Math.random() * LETTER_BAG.length)];
		this.nextLetter = this.add.text(this.input.x, 50, letter, {
			fontFamily: "Georgia",
			fontSize: 36,
			color: "#4a4a4a",
			align: "center",
		})
			.setOrigin(0.5)
			.setDepth(200); 
	}

	public dropNextLetter() {
		this.matter.add.gameObject(this.nextLetter);
		this.createNextLetter();
	}
}
