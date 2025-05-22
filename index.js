const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const dotenv = require('dotenv');

dotenv.config();

// Configure AWS SDK
AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const s3 = new AWS.S3();

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
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
            defaultViewport: {
                width: 1920,
                height: 1080
            },
        });
        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.157 Safari/537.36");
        if (processedUrl.includes('amazon')) {
            console.log('amazon');
            await page.goto(processedUrl);
            console.log("opened wait");
            await new Promise(resolve => setTimeout(resolve, 5000));
        } else {
            await page.goto(processedUrl, { waitUntil: 'networkidle0', timeout: 30000 });
        }
        console.log("taking screenshot");
        const screenshotBuffer = await page.screenshot({ type: 'png' });
        
        console.log("screenshot taken");
        console.log("getting html");
        const htmlContent = await page.content();
        console.log("html got");

        const s3BucketName = process.env.S3_BUCKET_NAME;
        if (!s3BucketName) {
            console.error('S3_BUCKET_NAME environment variable is not set.');
            return res.status(500).json({ error: 'S3 bucket name not configured on server' });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const randomString = uuidv4();
        const baseFileName = `snapshot-${timestamp}-${randomString}`;
        const screenshotKey = `${baseFileName}.png`;
        const htmlKey = `${baseFileName}.html`;

        // Upload screenshot to S3
        const screenshotUploadParams = {
            Bucket: s3BucketName,
            Key: screenshotKey,
            Body: screenshotBuffer,
            ContentType: 'image/png'
        };
        const screenshotUploadResult = await s3.upload(screenshotUploadParams).promise();
        console.log('Screenshot uploaded to S3:', screenshotUploadResult.Location);

        // Upload HTML to S3
        const htmlUploadParams = {
            Bucket: s3BucketName,
            Key: htmlKey,
            Body: htmlContent,
            ContentType: 'text/html'
        };
        const htmlUploadResult = await s3.upload(htmlUploadParams).promise();
        console.log('HTML uploaded to S3:', htmlUploadResult.Location);

        res.status(200).json({
            message: 'Screenshots and HTML captured and uploaded successfully',
            screenshotUrl: screenshotUploadResult.Location,
            htmlUrl: htmlUploadResult.Location
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

const server = app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

server.timeout = 360000; // 6 minutes, e.g. 5 minutes for puppeteer + 1 minute buffer 