const esbuild = require('esbuild');
const { execSync } = require('child_process');
const fs = require('fs');

// Opções de linha de comando
const isWatch = process.argv.includes('--watch');
const isProduction = process.argv.includes('--production') || process.argv.includes('--minify');

// Garanta que o diretório dist exista
if (!fs.existsSync('./dist')) {
	fs.mkdirSync('./dist', { recursive: true });
}

// Configuração básica
const buildOptions = {
	entryPoints: ['./src/extension.ts'],
	bundle: true,
	external: ['vscode'],
	platform: 'node',
	outfile: './dist/extension.js',
	sourcemap: !isProduction,
	minify: isProduction,
	logLevel: 'info'
};

async function build() {
	try {
		if (isWatch) {
			// No modo de watch, usamos o context
			const context = await esbuild.context(buildOptions);
			await context.watch();
			console.log('Watching for changes...');
		} else {
			// Build simples
			await esbuild.build(buildOptions);
			console.log('Build completed successfully!');
		}
	} catch (err) {
		console.error('Build failed:', err);
		process.exit(1);
	}
}

build();