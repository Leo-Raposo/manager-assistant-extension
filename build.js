const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Verifique se o diretório dist existe, se não, crie-o
if (!fs.existsSync('dist')) {
    fs.mkdirSync('dist', { recursive: true });
}

try {
    // Compile o TypeScript
    console.log('Compilando TypeScript...');
    execSync('npx tsc --outDir out', { stdio: 'inherit' });

    // Copie o arquivo compilado para dist
    console.log('Copiando para dist...');
    fs.copyFileSync(path.join('out', 'extension.js'), path.join('dist', 'extension.js'));

    // Copie o sourcemap se existir
    if (fs.existsSync(path.join('out', 'extension.js.map'))) {
        fs.copyFileSync(path.join('out', 'extension.js.map'), path.join('dist', 'extension.js.map'));
    }

    console.log('Build concluído com sucesso!');
} catch (error) {
    console.error('Erro no build:', error);
    process.exit(1);
}