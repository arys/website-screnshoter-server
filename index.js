const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 1234;

app.use(cors());
app.use(express.json());

app.post('/screenshot', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    // Add protocol if missing
    let processedUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        processedUrl = `https://${url}`;
    }

    let browser;
    try {
        browser = await puppeteer.launch({
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Recommended for running in a server environment
        });
        const page = await browser.newPage();
        
        await page.goto(processedUrl, { waitUntil: 'networkidle0' });

        const screenshotBuffer = await page.screenshot({ type: 'png' });
        const htmlContent = await page.content();

        res.status(200).json({
            message: 'Screenshots and HTML captured successfully',
            screenshot: screenshotBuffer.toString('base64'), // Send as base64 string
            html: htmlContent
        });

    } catch (error) {
        console.error('Error capturing website:', error);
        res.status(500).json({ error: 'Failed to capture website', details: error.message });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
}); 