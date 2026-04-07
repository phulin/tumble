import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const phasermsg = () => {
	return {
		name: "phasermsg",
		buildStart() {
			process.stdout.write(`Building for production...\n`);
		},
		buildEnd() {
			const line = "---------------------------------------------------------";
			const msg = `❤️❤️❤️ Tell us about your game! - games@phaser.io ❤️❤️❤️`;
			process.stdout.write(`${line}\n${msg}\n${line}\n`);

			process.stdout.write(`✨ Done ✨\n`);
		},
	};
};

export default defineConfig({
	base: "./",
	plugins: [react(), phasermsg()],
	logLevel: "warning",
	build: {
		rollupOptions: {
			output: {
				manualChunks(id) {
					if (id.includes("node_modules")) {
						return "phaser";
					}
				},
			},
		},
	},
});
