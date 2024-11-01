// external.js
const axios = require('axios');
const config = require('../../config.json');

async function uploadToPasteGG(content) {
    try {
        const response = await axios.post('https://api.paste.gg/v1/pastes', {
            name: 'Vote List',
            files: [{ name: 'votes.txt', content: { format: 'text', value: content } }]
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        if (response.data?.result?.id) {
            return `https://paste.gg/${response.data.result.id}`;
        }
        console.error('Paste.gg upload error:', response.data);
        return null;
    } catch (error) {
        console.error('Error uploading to Paste.gg:', error.response?.data || error.message);
        return null;
    }
}

async function uploadToImgur(imageUrl) {
    const clientId = config.imgur_client_id;
    try {
        const response = await axios.post('https://api.imgur.com/3/image', {
            image: imageUrl,
            type: 'url'
        }, {
            headers: { Authorization: `Client-ID ${clientId}` }
        });
        return response.data.data.link;
    } catch (error) {
        console.error('Error uploading to Imgur:', error);
        return null;
    }
}

module.exports = { uploadToPasteGG, uploadToImgur };
