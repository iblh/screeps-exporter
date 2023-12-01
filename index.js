const axios = require('axios');
const zlib = require('zlib');
const atob = require('atob');
const { Buffer } = require('buffer');
const express = require('express');
const app = express();
const PORT = 5025;

require('dotenv').config();

async function getScreepsMemory(apiUrl, token) {
    try {
        const headers = { 'X-Token': token };
        const response = await axios.get(apiUrl, { headers });
        return response.data.data;
    } catch (error) {
        console.error(`Failed to fetch data: ${error}`);
        return null;
    }
}

function decodeBase64(base64Data) {
    const binaryString = atob(base64Data);
    const length = binaryString.length;
    const bytes = new Uint8Array(length);

    for (let i = 0; i < length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    return Buffer.from(bytes.buffer);
}


function decodeScreepsMemory(encodedData) {
    try {
        // Remove 'gz:' prefix and decode from base64
        const base64Data = encodedData.substring(3);
        const bufferData = decodeBase64(base64Data);

        // Decompress data
        const decompressedData = zlib.gunzipSync(bufferData).toString();

        // Parse JSON
        return JSON.parse(decompressedData);
    } catch (error) {
        console.error(`Error in decoding or parsing: ${error}`);
        return null;
    }
}

function formatForPrometheus(data) {
    let stats = [];

    // Formatting GCL data
    if (data.gcl) {
        stats.push(`screeps_gcl_progress{level="${data.gcl.level}"} ${data.gcl.progress}`);
        stats.push(`screeps_gcl_progress_total{level="${data.gcl.level}"} ${data.gcl.progressTotal}`);
    }

    // Formatting Room data
    if (data.rooms) {
        for (const [roomName, roomData] of Object.entries(data.rooms)) {
            stats.push(`screeps_room_storage_energy{room="${roomName}"} ${roomData.storageEnergy}`);
            stats.push(`screeps_room_terminal_energy{room="${roomName}"} ${roomData.terminalEnergy}`);
            stats.push(`screeps_room_energy_available{room="${roomName}"} ${roomData.energyAvailable}`);
            stats.push(`screeps_room_energy_capacity_available{room="${roomName}"} ${roomData.energyCapacityAvailable}`);
            stats.push(`screeps_room_controller_progress{room="${roomName}"} ${roomData.controllerProgress}`);
            stats.push(`screeps_room_controller_progress_total{room="${roomName}"} ${roomData.controllerProgressTotal}`);
            stats.push(`screeps_room_controller_level{room="${roomName}"} ${roomData.controllerLevel}`);
        }
    }

    // Formatting CPU data
    if (data.cpu) {
        stats.push(`screeps_cpu_bucket ${data.cpu.bucket}`);
        stats.push(`screeps_cpu_limit ${data.cpu.limit}`);
        stats.push(`screeps_cpu_used ${data.cpu.used}`);
    }

    // Formatting Time data
    if (data.time) {
        stats.push(`screeps_time ${data.time}`);
    }

    return stats.join('\n');
}

app.get('/', async (req, res) => {
    const apiUrl = "https://screeps.com/api/user/memory?shard=shard3&path=stats";
    const token = process.env.SCREEPS_TOKEN;

    const encodedMemory = await getScreepsMemory(apiUrl, token);
    if (encodedMemory) {
        const decodedMemory = decodeScreepsMemory(encodedMemory);
        if (decodedMemory) {
            // res.type('text/plain').send(decodedMemory);
            const formattedStats = formatForPrometheus(decodedMemory);
            res.type('text/plain').send(formattedStats);
        } else {
            res.status(500).send('Error processing data');
        }
    } else {
        res.status(500).send('Error fetching data');
    }
});

app.listen(PORT, () => {
    console.log(`Screeps Exporter running on http://localhost:${PORT}`);
});

module.exports = app;