
const fs = require('fs');
let esbuild;

try {
    esbuild = require('esbuild');
} catch (e) {
    console.error("\n\x1b[31m%s\x1b[0m", "❌ CRITICAL ERROR: 'esbuild' is missing.");
    console.error("The build tool 'esbuild' was not found in your node_modules.");
    console.error("\x1b[33m%s\x1b[0m", "➤  PLEASE RUN THIS COMMAND TO FIX IT:");
    console.error("\n    npm install\n");
    process.exit(1);
}

async function build() {
    // 0. Load .env manually to avoid extra dependencies
    // We check for both .env and .env.txt because Windows Notepad often adds .txt by default
    let loadedEnv = false;
    const envFiles = ['.env', '.env.txt'];
    
    for (const file of envFiles) {
        try {
            if (fs.existsSync(file)) {
                console.log(`Loading configuration from ${file}...`);
                const envConfig = fs.readFileSync(file, 'utf8');
                envConfig.split('\n').forEach(line => {
                    const parts = line.split('=');
                    if (parts.length >= 2) {
                        const key = parts[0].trim();
                        let val = parts.slice(1).join('=').trim();
                        // Remove quotes if present
                        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
                            val = val.slice(1, -1);
                        }
                        if (key === 'API_KEY') {
                            process.env[key] = val;
                            loadedEnv = true;
                        }
                    }
                });
                if (loadedEnv) break;
            }
        } catch (e) {
            console.warn(`Error reading ${file}:`, e.message);
        }
    }

    // 1. Ensure Directories exist
    if (!fs.existsSync('www')) fs.mkdirSync('www');
    if (!fs.existsSync('www/asset')) fs.mkdirSync('www/asset', {recursive: true});
    if (!fs.existsSync('www/assets')) fs.mkdirSync('www/assets', {recursive: true});

    // 2. Copy Static Assets
    if (fs.existsSync('index.html')) fs.copyFileSync('index.html', 'www/index.html');

    const paths = ['asset/logo.png', 'assets/logo.png', 'asset/Logo.png', 'assets/Logo.png'];
    let found = false;
    for(const p of paths) {
        if(fs.existsSync(p)) {
            console.log('Copying logo from:', p);
            fs.copyFileSync(p, 'www/asset/logo.png');
            fs.copyFileSync(p, 'www/assets/logo.png');
            found = true;
            break;
        }
    }
    if(!found) console.warn('WARNING: Logo not found in asset/ or assets/');

    // 3. Build & Inject API Key
    const apiKey = process.env.API_KEY;
    
    if (!apiKey) {
        console.warn("\n\x1b[33m%s\x1b[0m", "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        console.warn("\x1b[33m%s\x1b[0m", "WARNING: API_KEY is missing. The AI Chat will show a Configuration Error.");
        console.warn("1. Create a file named '.env' in this folder.");
        console.warn("2. Add this line: API_KEY=AIzaSy...");
        console.warn("3. Run the build command again.");
        console.warn("\x1b[33m%s\x1b[0m", "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!\n");
    } else {
        console.log("\x1b[32m%s\x1b[0m", `✓ API_KEY detected (${apiKey.substring(0, 8)}...) and injected.`);
    }

    // Ensure strict string injection for define
    const apiKeyDefine = apiKey ? `'${apiKey.trim()}'` : '""';

    try {
        await esbuild.build({
            entryPoints: ['index.tsx'],
            bundle: true,
            outfile: 'www/index.js',
            platform: 'browser',
            format: 'esm',
            minify: true,
            sourcemap: true,
            external: ['react', 'react-dom', '@supabase/supabase-js', 'exceljs', '@google/genai'],
            define: {
                // This injects the key string literal into the browser code
                'process.env.API_KEY': apiKeyDefine
            }
        });
        console.log('Build completed successfully.');
    } catch (e) {
        console.error('Build failed:', e);
        process.exit(1);
    }
}

build();
