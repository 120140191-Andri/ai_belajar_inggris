import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const apiKey = process.env.VITE_GEMINI_API_KEY;

async function list() {
    let url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey;
    let hasNext = true;
    while(hasNext) {
        const response = await fetch(url);
        const data = await response.json();
        for (const model of data.models || []) {
            console.log(model.name);
        }
        if (data.nextPageToken) {
            url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + apiKey + "&pageToken=" + data.nextPageToken;
        } else {
            hasNext = false;
        }
    }
}

list();
