// netlify/functions/generate-risk.js

// This is your Netlify Function that acts as a secure proxy to the Gemini API.
// It will be executed on Netlify's servers, keeping your API key secure.

const fetch = require('node-fetch'); // Node.js built-in fetch or require 'node-fetch' if older Node.js runtime

exports.handler = async function(event, context) {
    console.log('Function invoked: Starting generate-risk.js execution.'); // DEBUG
    // 1. Ensure the request method is POST.
    if (event.httpMethod !== 'POST') {
        console.warn('Method Not Allowed:', event.httpMethod); // DEBUG
        return {
            statusCode: 405,
            body: JSON.stringify({ message: "Method Not Allowed. This function only accepts POST requests." })
        };
    }

    // 2. Parse the request body to get the 'prompt' sent from your frontend.
    let prompt;
    try {
        const body = JSON.parse(event.body);
        prompt = body.prompt;
        console.log('Request body parsed. Prompt length:', prompt ? prompt.length : '0'); // DEBUG
    } catch (parseError) {
        console.error("Error parsing request body:", parseError); // DEBUG
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "Invalid JSON body." })
        };
    }

    // 3. Validate that a prompt was actually sent.
    if (!prompt) {
        console.error('Prompt is missing from request body.'); // DEBUG
        return {
            statusCode: 400,
            body: JSON.stringify({ message: "Prompt is required in the request body." })
        };
    }

    // 4. Retrieve the Gemini API Key securely from Netlify's environment variables.
    // This key is NEVER exposed to the client-side browser.
    const API_KEY = process.env.GEMINI_API_KEY; // This MUST match the variable name you set in Netlify settings.

    if (!API_KEY) {
        console.error("GEMINI_API_KEY environment variable is not set on Netlify."); // DEBUG
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Server API key is not configured. Please set GEMINI_API_KEY in Netlify environment variables." })
        };
    }
    console.log('API Key retrieved successfully (masked for security).'); // DEBUG

    const API_MODEL = "gemini-2.5-flash-preview-05-20"; // Your chosen AI model.
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${API_MODEL}:generateContent?key=${API_KEY}`;
    console.log('Gemini API URL constructed:', apiUrl.substring(0, 70) + '...'); // DEBUG (don't log full URL with key)

    // 5. Prepare the payload for the Gemini API call.
    let chatHistory = [];
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });
    const payload = { contents: chatHistory };
    console.log('Payload prepared for Gemini API.'); // DEBUG

    // --- Add fetch timeout ---
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // Set timeout to 20 seconds (20000 ms)

    // 6. Make the actual call to the Gemini API.
    try {
        console.log('Attempting fetch call to Gemini API with 20-second timeout...'); // DEBUG
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal // Apply the abort signal
        });
        clearTimeout(timeoutId); // Clear timeout if fetch completes in time
        console.log('Fetch response received from Gemini API. Status:', response.status); // DEBUG

        // 7. Handle non-OK responses from the Gemini API.
        if (!response.ok) {
            const errorBody = await response.json();
            console.error("Error calling Gemini API: Non-OK response.", response.status, response.statusText, errorBody); // DEBUG
            return {
                statusCode: response.status,
                body: JSON.stringify({ message: `Error from AI service: ${response.statusText}`, details: errorBody })
            };
        }

        const result = await response.json();
        console.log('JSON result parsed from Gemini API response.'); // DEBUG

        // 8. Extract the generated text from Gemini's response structure.
        if (result.candidates && result.candidates.length > 0 &&
            result.candidates[0].content && result.candidates[0].content.parts &&
            result.candidates[0].content.parts.length > 0) {
            const generatedText = result.candidates[0].content.parts[0].text;
            console.log('Generated text extracted successfully. Length:', generatedText.length); // DEBUG
            // Return the extracted text to your frontend.
            return {
                statusCode: 200,
                body: JSON.stringify({ text: generatedText })
            };
        } else {
            // Handle cases where Gemini's response is valid but doesn't contain text.
            console.warn("Gemini API returned an unexpected structure or no text:", result); // DEBUG
            return {
                statusCode: 200, // Still a successful call, but no text generated.
                body: JSON.stringify({ text: "" }) // Send an empty string or a specific message.
            };
        }

    } catch (error) {
        // Handle network errors or other unexpected issues during the fetch call.
        // Check if it's an AbortError (due to timeout)
        if (error.name === 'AbortError') {
            console.error("AI API call timed out after 20 seconds.", error); // DEBUG
            return {
                statusCode: 504, // Gateway Timeout
                body: JSON.stringify({ message: "AI service call timed out. Please try again." })
            };
        } else {
            console.error("Network or unexpected error during AI API call (caught in try-catch):", error); // DEBUG
            return {
                statusCode: 500,
                body: JSON.stringify({ message: "Failed to connect to the AI service due to a server-side error.", error: error.message })
            };
        }
    } finally {
        console.log('Function execution finished (or caught error).'); // DEBUG
    }
};
