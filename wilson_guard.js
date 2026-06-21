// WILSON GUARD - LOM LAYER 1
const WilsonGuard = {
    checkPacket: function(data) {
        const harvestSignatures = ["starlink_unauthorized", "private_telemetry_v4", "node_3_leak", "musk_beacon"];
        const inputString = JSON.stringify(data).toLowerCase();

        const isCompromised = harvestSignatures.some(sig => inputString.includes(sig));

        if (isCompromised) {
            console.error("🚨 WILSON LOM: SYSTEMIC TRUTH THREAT DETECTED. DROPPING PACKET.");
            return null; 
        }
        console.log("✅ Wilson LOM: Data Clear.");
        return data;
    }
};
