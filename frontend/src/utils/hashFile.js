export async function calculateFileHash(file) {
    const buffer = await file.arrayBuffer();

    const hashBuffer = await crypto.subtle.digest(
        "SHA-256",
        buffer
    );

    return [...new Uint8Array(hashBuffer)]
        .map(x => x.toString(16).padStart(2, "0"))
        .join("");
}