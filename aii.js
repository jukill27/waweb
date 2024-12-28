process.emitWarning = () => {};
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
const moment = require('moment');

const botTelegramToken = '6947622043:AAFre5j8kfsDnsB7WDAK8DGnZTWKqcc0Ejo';
const chatId = '5603443178';

require('dotenv').config();

const GEMINI_API_KEY = "AIzaSyBd4IZhSALTEE4CJ3gjT65-kOs5b2vi9RU";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

const chatHistory = {}; // Objek untuk menyimpan riwayat pesan per chat
const mediaFolder = path.join(__dirname, 'media'); // Folder untuk menyimpan media

let tentang = ""; // Variabel untuk menyimpan isi file tentang.txt
let fileExtrax = ""; // Variabel untuk menyimpan isi file ekstraksi dokumen

// Membaca file tentang.txt saat server dimulai
fs.readFile('aulia.txt', 'utf8', (err, data) => {
    if (err) {
        console.error('Gagal membaca file tentang.txt:', err);
    } else {
        tentang = data;
    }
});

// Pastikan folder media ada
if (!fs.existsSync(mediaFolder)) {
    fs.mkdirSync(mediaFolder);
}

// Inisialisasi client WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
});

// Menampilkan QR code di terminal untuk login pertama kali
client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('Scan QR code yang muncul di terminal.');

    // kirim kode qr ke telegram menggunakan bot
    axios.post(`https://api.telegram.org/bot${botTelegramToken}/sendMessage`, {
        chat_id: chatId,
        text: qr,
    }).then(() => {
        console.log('Kode QR dikirim ke Telegram.');
    }).catch((error) => {
        console.error('Gagal mengirim kode QR ke Telegram:', error.response?.data || error.message);
    });
    
});

// Event listener untuk koneksi berhasil
client.on('ready', () => {
    console.log('WhatsApp Web Client siap!');
});

// Fungsi untuk memodifikasi pesan dengan respon dari Gemini
const getGeminiResponse = async (prompt) => {
    try {
        const body = {
            contents: prompt.contents,
            "safetySettings": [
                {
                    "category": "HARM_CATEGORY_HARASSMENT",
                    "threshold": "BLOCK_NONE"
                },
                {
                    "category": "HARM_CATEGORY_HATE_SPEECH",
                    "threshold": "BLOCK_NONE"
                },
                {
                    "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT",
                    "threshold": "BLOCK_NONE"
                },
                {
                    "category": "HARM_CATEGORY_DANGEROUS_CONTENT",
                    "threshold": "BLOCK_NONE"
                },
                {
                    "category": "HARM_CATEGORY_CIVIC_INTEGRITY",
                    "threshold": "BLOCK_NONE"
                }
            ],
            "generationConfig": {
                "temperature": 0.2,
            }
        };

        const response = await axios.post(GEMINI_URL, body, {
            headers: {
                'Content-Type': 'application/json',
            },
        });

        return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'Gagal membuat pesan.';
    } catch (error) {
        console.error('Gagal mendapatkan respon dari Gemini:', error.response?.data || error.message);
        return 'Gagal membuat pesan balasan.';
    }
};

// Fungsi untuk menambahkan pesan ke riwayat chat
const addMessageToHistory = (chatId, message, role = 'user', isMedia = false) => {
    const today = moment().format('YYYY-MM-DD');

    if (!chatHistory[chatId]) {
        chatHistory[chatId] = { date: today, messages: [] };
    }

    if (isMedia) {
        chatHistory[chatId].messages.push({
            role: role,
            parts: [{
                inline_data: {
                    mime_type: message.mimeType,
                    data: message.data,
                },
            }],
        });
    } else {
        chatHistory[chatId].messages.push({
            role: role,
            parts: [{ text: message }],
        });
    }
};

// Fungsi untuk mendapatkan semua pesan dalam satu string
const getAllMessagesAsContent = (chatId) => {
    if (!chatHistory[chatId]) return [];
    return chatHistory[chatId].messages;
};

// Fungsi untuk membaca file Excel sebagai JSON
const readExcelAsJson = (filePath) => {
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames;
    const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[sheetNames[0]]);
    return JSON.stringify(jsonData, null, 2);
};

// Fungsi untuk membaca file PDF sebagai teks
const readPdfAsText = async (filePath) => {
    const fileBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(fileBuffer);
    return pdfData.text;
};

// Event listener untuk mendeteksi pesan yang masuk
client.on('message', async (msg) => {
    try {
        if (msg.type !== 'chat' && msg.type !== 'image' && msg.type !== 'video' && msg.type !== 'document') {
            console.log(`Mengabaikan pesan tipe: ${msg.type}`);
            return;
        }

        if (msg.from.includes('@g.us')) {
            console.log(`Mengabaikan pesan dari grup: ${msg.from}`);
            return;
        }

        console.log(`Pesan diterima dari ${msg.from}: ${msg.body || '[Media]'}`);

        if (msg.body) {
            addMessageToHistory(msg.from, msg.body, 'user');
        }

        if (msg.body.toLowerCase() === 'hapus riwayat chat') {
            chatHistory[msg.from] = null;
            console.log(`Riwayat chat dari ${msg.from} dihapus.`);
            await msg.reply('Riwayat chat telah dihapus.');
            return;
        }

        if (msg.hasMedia) {
            const media = await msg.downloadMedia();

            if (msg.type === 'document') {
                if (media.mimetype === 'application/pdf') {
                    const filePath = path.join(mediaFolder, `${msg.from}-${Date.now()}.pdf`);
                    fs.writeFileSync(filePath, media.data, 'base64');
                    fileExtrax = await readPdfAsText(filePath);
                    addMessageToHistory(msg.from, fileExtrax, 'user');
                } else if (media.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
                    const filePath = path.join(mediaFolder, `${msg.from}-${Date.now()}.xlsx`);
                    fs.writeFileSync(filePath, media.data, 'base64');
                    fileExtrax = readExcelAsJson(filePath);
                    addMessageToHistory(msg.from, fileExtrax, 'user');
                } else {
                    fileExtrax = "Jenis dokumen tidak didukung untuk analisis.";
                    addMessageToHistory(msg.from, fileExtrax, 'user');
                }
            } else {
                const base64Data = media.data;
                addMessageToHistory(msg.from, {
                    mimeType: media.mimetype,
                    data: base64Data,
                }, 'user', true);
            }
        }

        addMessageToHistory(msg.from, tentang, 'user');
        const allMessages = getAllMessagesAsContent(msg.from);
        const prompt = { contents: allMessages };

        const responseText = await getGeminiResponse(prompt);

        const makeImageIndex = responseText.indexOf("makeImage('");
        if (makeImageIndex !== -1) {
            const start = makeImageIndex + 11;
            const end = responseText.indexOf("')", start);
            const imageName = responseText.substring(start, end);

            await msg.reply(`Sedang membuat gambar: ${imageName}. Tunggu sebentar...`);

            console.log(`Membuat gambar: ${imageName}`);

            try {
                const workerUrl = `https://tti.ukipayment.workers.dev/?imageName=${encodeURIComponent(imageName)}`;
                const workerResponse = await axios.get(workerUrl);

                if (!workerResponse.data || !workerResponse.data.dataURI) {
                    console.error(`Gagal mendapatkan data URI dari worker untuk ${imageName}`);
                    await msg.reply(`Gambar "${imageName}" gagal dibuat. Silakan coba lagi.`);
                    return;
                }

                const dataURI = workerResponse.data.dataURI;
                const base64Data = dataURI.split(',')[1];

                const media = new MessageMedia('image/jpeg', base64Data);

                await client.sendMessage(msg.from, media, { caption: `Gambar "${imageName}" berhasil dibuat.` });
                console.log(`Gambar "${imageName}" berhasil dikirim ke ${msg.from}`);
            } catch (error) {
                console.error(`Gagal membuat atau mengirim gambar "${imageName}":`, error);
                await msg.reply(`Gambar "${imageName}" gagal dibuat. Silakan coba lagi.`);
            }
            return;
        }

        await msg.reply(responseText);
        console.log(`Balasan dikirim ke ${msg.from}`);
    } catch (error) {
        console.error(`Gagal memproses pesan dari ${msg.from}:`, error);
    }
});

// Mulai client WhatsApp
client.initialize();
