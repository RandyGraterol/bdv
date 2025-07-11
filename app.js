import express from 'express';
const app = express();
import puppeteer from 'puppeteer-extra'; // Usamos puppeteer-extra
import stealth from 'puppeteer-extra-plugin-stealth';
import anonymizer from 'puppeteer-extra-plugin-anonymize-ua';
import fs from 'fs';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
app.use(cors());

const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

puppeteer.use(stealth());
puppeteer.use(anonymizer());

let browser;
let page;
let nPagoV = 0;
let nPagoR = 0;

(async () => {
    let timer = 0;

    // Configura Puppeteer para usar puppeteer-core y la ruta de Chrome
    browser = await puppeteer.launch({
        headless: true, // Cambia a true para Render
        executablePath: process.env.NODE_ENV === 'production' 
        ? process.env.PUPPETEER_EXECUTABLE_PATH 
        : puppeteer.executablePath(), // Ruta de Chrome en Render
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            //'--disable-dev-shm-usage',
            '--single-process',
            '--no-zygote',
        ],
    });

    page = await browser.newPage();

    // Load cookies
    const cookiesPath = 'cookies.json'; // Cambia la ruta para Render
    if (fs.existsSync(cookiesPath)) {
        try {
            const cookiesData = fs.readFileSync(cookiesPath, 'utf8');
            if (cookiesData) {
                const cookies = JSON.parse(cookiesData);
                // Extend the expiration time of cookies
                const extendedCookies = cookies.map(cookie => {
                    if (cookie.expires !== -1) {
                        cookie.expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30; // Extend by 30 days
                    }
                    return cookie;
                });
                await page.setCookie(...extendedCookies);
            }
        } catch (error) {
            console.error('Error parsing cookies.json:', error);
        }
    }

    await page.goto('https://bdvenlinea.banvenez.com/', { waitUntil: 'load', timeout: 0 });

    // Load localStorage
    const localStoragePath = 'localStorage.json'; // Cambia la ruta para Render
    if (fs.existsSync(localStoragePath)) {
        try {
            const localStorageData = fs.readFileSync(localStoragePath, 'utf8');
            if (localStorageData) {
                await page.evaluate(data => {
                    const entries = JSON.parse(data);
                    for (let [key, value] of Object.entries(entries)) {
                        localStorage.setItem(key, value);
                    }
                }, localStorageData);
            }
        } catch (error) {
            console.error('Error parsing localStorage.json:', error);
        }
    }

    page.setRequestInterception(true);
    page.on('request', (request) => {
        if (request.resourceType() === 'document' || request.resourceType() === 'script') {
            request.continue();
        } else {
            request.abort();
        }
    });

    // Function to refresh the session token
    const refreshSession = async () => {
        try {
            await page.goto('https://bdvenlinea.banvenez.com/', { waitUntil: 'domcontentloaded', timeout: 0 });
            await page.waitForSelector('td mat-icon', { timeout: 0 });
            await delay(300);
            await page.click('td mat-icon');
            console.log('Session refreshed');
        } catch (error) {
            console.error('Error refreshing session:', error);
        }
    };

    // Set interval to refresh the session every minute
    setInterval(refreshSession, 40000);

    try {
        await page.waitForSelector('input[formcontrolname="username"]', { timeout: 0 });
        await page.type('input[formcontrolname="username"]', 'Randyyfiore');
        await delay(200);
        await page.click('button[type="submit"]');
        await page.waitForSelector('input[formcontrolname="password"]', { timeout: 0 });
        await page.type('input[formcontrolname="password"]', 'ponySalvaje07.');
        await page.click('div.button-container button[type="submit"]');
        await page.waitForSelector('td mat-icon', { timeout: 0 });
        await delay(300);
        await page.click('td mat-icon');
    } catch (error) {
        console.error(error);
    }

    // Collect and log cookies
    const cookies = await page.cookies();
    fs.writeFileSync('cookies.json', JSON.stringify(cookies, null, 2));
})();

app.post('/Verify', async (req, res) => {
    let { rawreferencia, rawmonto } = req.body;
    let referencia = rawreferencia.toString();
    let monto = parseFloat(rawmonto);

    try {
        try {
            await page.waitForSelector('input[placeholder="Buscar"]', { timeout: 0 });
            await page.type('input[placeholder="Buscar"]', referencia);
        } catch (error) {
            console.error(error);
            console.log('Error en la referencia: ', referencia);
            res.status(500).json({ message: 'intenta de nuevo por favor' });
        }

        let collectedData = await page.evaluate(() => {
            let ref = document.querySelector('mat-row mat-cell.mat-column-referencia') ? document.querySelector('mat-row mat-cell.mat-column-referencia').innerText : "N/A";
            let importe = document.querySelector('mat-row mat-cell.mat-column-importe') ? document.querySelector('mat-row mat-cell.mat-column-importe').innerText : "N/A";
            let importeDone;
            if (importe != "N/A") {
                let cut = importe.split('B');
                let rawnumero = cut[0];
                let mediumrare = rawnumero.replace(/,/, '.');
                let numero = parseFloat(mediumrare);
                importeDone = numero;
            }
            let fecha = document.querySelector('mat-row mat-cell.mat-column-fecha') ? document.querySelector('mat-row mat-cell.mat-column-fecha').innerText : "N/A";
            return {
                ref: ref,
                monto: importeDone,
                fecha: fecha,
            };
        });

        await page.waitForSelector('input[placeholder="Buscar"]', { timeout: 0 });
        await page.$eval('input[placeholder="Buscar"]', el => el.value = '');

        if (collectedData.monto == monto && collectedData.ref.includes(referencia)) {
            collectedData.satus = 'Validado';
            collectedData.montorecibido = monto;
            collectedData.RefRecibida = referencia;
            nPagoV = nPagoV + 1;
            console.log('Pago Valido, datos: ', collectedData);
            console.log('------------------------');
            console.log('pagos validados', nPagoV);
            console.log('pagos rechazados', nPagoR);
            console.log('pagos totales', nPagoV + nPagoR);
            console.log('------------------------');
            res.status(200).json(collectedData);
        } else {
            collectedData.satus = 'Pago falso, revisar manualmente o descartar';
            collectedData.montorecibido = monto;
            collectedData.RefRecibida = referencia;
            console.log('descartar o verificar manualmente: ', collectedData);
            console.log('--------------------------');
            nPagoR = nPagoR + 1;
            console.log('pagos validados', nPagoV);
            console.log('pagos Rechazados', nPagoR);
            console.log('pagos totales', nPagoV + nPagoR);
            console.log('--------------------------');
            res.status(403).json(collectedData);
        }
    } catch (error) {
        console.error(error);
        console.log('Error en la referencia: ', referencia);
        res.status(500).json({ message: 'Error en la referencia', referencia: referencia });
    }
});

app.listen(PORT, () => {
    console.log('Server running on port 3000');
});