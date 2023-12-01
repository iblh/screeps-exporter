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
    let metrics = [];

    // GCL Metrics
    if (data.stats.gcl) {
        metrics.push(`screeps_gcl_level ${data.stats.gcl.level}`);
        metrics.push(`screeps_gcl_progress ${data.stats.gcl.progress}`);
        metrics.push(`screeps_gcl_progress_total ${data.stats.gcl.progressTotal}`);
        metrics.push(`screeps_gcl_tickDuration ${data.stats.gcl.tickDuration}`);
    }

    // Creeper Metrics
    if (data.creeps) {
        // count total number of creeps
        metrics.push(`screeps_creep_count ${Object.keys(data.creeps).length}`);

        let creepRoles = {};

        for (const [creepName, creepData] of Object.entries(data.creeps)) {
            // creepData.role
            // if role is in creepRoles, increment count
            if (creepData.role in creepRoles) {
                creepRoles[creepData.role] += 1;
            } else {
                creepRoles[creepData.role] = 1;
            }
        }
        for (const [roleName, roleCount] of Object.entries(creepRoles)) {
            metrics.push(`screeps_creep_role_count{role="${roleName}"} ${roleCount}`);
        }
    }

    // Room Metrics
    if (data.stats.rooms) {
        for (const [roomName, roomData] of Object.entries(data.stats.rooms)) {
            metrics.push(`screeps_room_storage_energy{room="${roomName}"} ${roomData.storageEnergy}`);
            metrics.push(`screeps_room_terminal_energy{room="${roomName}"} ${roomData.terminalEnergy}`);
            metrics.push(`screeps_room_energy_available{room="${roomName}"} ${roomData.energyAvailable}`);
            metrics.push(`screeps_room_energy_capacity_available{room="${roomName}"} ${roomData.energyCapacityAvailable}`);
            metrics.push(`screeps_room_controller_progress{room="${roomName}"} ${roomData.controllerProgress}`);
            metrics.push(`screeps_room_controller_progress_total{room="${roomName}"} ${roomData.controllerProgressTotal}`);
            metrics.push(`screeps_room_controller_level{room="${roomName}"} ${roomData.controllerLevel}`);
        }
    }

    // CPU Metrics
    if (data.stats.cpu) {
        metrics.push(`screeps_cpu_bucket ${data.stats.cpu.bucket}`);
        metrics.push(`screeps_cpu_limit ${data.stats.cpu.limit}`);
        metrics.push(`screeps_cpu_used ${data.stats.cpu.used}`);
    }

    // Time Metric
    if (data.stats.time) {
        metrics.push(`screeps_time ${data.stats.time}`);
    }

    return metrics.join('\n');
}


app.get('/metrics', async (req, res) => {
    const apiUrl = "https://screeps.com/api/user/memory?shard=shard3";
    const token = process.env.SCREEPS_TOKEN;

    const encodedMemory = await getScreepsMemory(apiUrl, token);
    if (encodedMemory) {
        const decodedMemory = decodeScreepsMemory(encodedMemory);
        if (decodedMemory) {
            // res.type('text/plain').send(decodedMemory);
            const formattedMetrics = formatForPrometheus(decodedMemory);
            res.type('text/plain').send(formattedMetrics);
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