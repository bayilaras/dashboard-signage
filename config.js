// ============================================
// KONFIGURASI DASHBOARD DIGITAL SIGNAGE
// ============================================

const CONFIG = {
  // Google Spreadsheet Configuration
  spreadsheet: {
    // Masukkan ID spreadsheet dari URL
    // URL: https://docs.google.com/spreadsheets/d/1LSqjaCY_wmLbjcf3-vNC-DEZM6bliwTr6PxLz4uPgn8/edit
    id: '1LSqjaCY_wmLbjcf3-vNC-DEZM6bliwTr6PxLz4uPgn8',

    // Nama sheet yang digunakan (default: Sheet1 atau nama pertama)
    sheetName: 'Form Responses 1',

    // GID dari URL (setelah #gid=)
    gid: '845292651',

    // Pilih metode akses data:
    // 'apps-script' - Menggunakan Google Apps Script Web App (lebih aman, perlu setup)
    // 'csv-export' - Menggunakan published CSV (lebih mudah, perlu publish spreadsheet)
    dataSource: 'apps-script'
  },

  // Google Apps Script Web App URL (jika menggunakan metode apps-script)
  // Setelah deploy Apps Script, masukkan URL Web App di sini
  appsScriptUrl: 'https://script.google.com/macros/s/AKfycbzkZncjoApQOkaNwjS3J4e8LI68ntwqo4jwB_xJTBenRslZlmM_1sVTkR_JhEAkw4nA-w/exec',

  // Mapping kolom dari spreadsheet
  // Sesuaikan dengan nama kolom di spreadsheet Anda
  columns: {
    'Timestamp': 'timestamp',
    'Nama': 'namaPemohon',
    'Satker': 'unit',
    'Agenda': 'keperluan',
    'Start Date': 'tanggal',
    'Start Time': 'jamMulai',
    'End Time': 'jamSelesai',
    'L2A': 'ruangan_L2A',
    'L2B': 'ruangan_L2B',
    'L2C': 'ruangan_L2C',
    'Jumlah Peserta': 'jumlahPeserta',
    'Status': 'status'
  },

  // Format tanggal dan waktu
  dateFormat: {
    // Format tanggal di spreadsheet: 'DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD', dll
    datePattern: 'DD/MM/YYYY',

    // Format waktu di spreadsheet: 'HH:mm', 'HH:MM', 'h:mm A', dll
    timePattern: 'HH:mm',

    // Zona waktu (WIB = Asia/Jakarta)
    timezone: 'Asia/Jakarta'
  },

  // Pengaturan tampilan
  display: {
    // Judul dashboard
    title: 'Jadwal Rapat Berlangsung',
    subtitle: 'Lantai 2',

    // Maksimal jumlah rapat yang ditampilkan sekaligus
    maxMeetingsDisplay: 6,

    // Tampilkan rapat yang akan dimulai dalam X menit ke depan
    upcomingMinutes: 60,

    // Tampilkan animasi transisi
    enableAnimations: true,

    // Mode tampilan: 'current' (hanya sedang berlangsung) atau 'current-upcoming' (berlangsung + akan datang)
    displayMode: 'current-upcoming',

    // Pengaturan Pagination (Auto-switch page)
    // Pengaturan Pagination (Auto-switch page)
    pagination: {
      enabled: true,
      itemsPerPage: 4, // Tampilkan hingga 4 meeting sekaligus (optimal untuk layar portrait)
      interval: 15000, // Ganti halaman setiap 15 detik
      animationDuration: 800 // Durasi animasi fade
    }
  },

  // Pengaturan refresh
  refresh: {
    // Interval refresh data dalam milidetik (300000 = 5 menit)
    interval: 300000, // Optimized for digital signage - frequent updates

    // Interval update waktu current dalam milidetik (1000 = 1 detik)
    clockInterval: 1000
  },

  // Pengaturan notifikasi/peringatan
  alerts: {
    // Tampilkan pesan ketika tidak ada rapat
    showNoMeetingMessage: true,
    noMeetingText: 'Tidak ada rapat berlangsung saat ini',

    // Tampilkan error message
    showErrors: true
  },

  // Konfigurasi Booking Room
  booking: {
    url: 'https://bit.ly/booking_ruangrapatL2',
    displayUrl: 'bit.ly/booking_ruangrapatL2',
    qrApiBase: 'https://api.qrserver.com/v1/create-qr-code/',
    qrSize: '400x400'
  },

  // Konfigurasi Wayfinding (Arah Ruangan)
  wayfinding: {
    'Ruang Rapat L2A': {
      detail: 'Masuk Pintu Sekretariat (Samping Ruangan Dirjen)',
    },
    'Ruang Rapat L2B': {
      detail: 'Masuk Pintu Direktorat Teknis (Samping Musholla)',
    },
    'Ruang Rapat L2C': {
      detail: 'Masuk Pintu Sekretariat (Dekat Pintu Masuk Sekretariat)',
    },
    'Co Working Space': {
      detail: 'Masuk Pintu Sekretariat',
    }
  },

  // Pengaturan Slideshow
  slideshow: {
    // Aktifkan slideshow
    // Aktifkan slideshow
    enabled: true,

    // Interval pergantian slide dalam milidetik (13000 = 13 detik)
    interval: 13000,

    // Mode idle: slideshow fullscreen ketika tidak ada rapat
    idleMode: true,

    // Logo untuk header/welcome slide
    logos: {
      djptpp: 'assets/logo-djptpp.png',
      atrbpn: 'assets/logo-atrbpn.png'
    },

    // Slide data akan di-load dari slides.json (dikelola via Admin Panel)
    dataSource: 'slides.json',

    // FALLBACK SLIDES (digunakan jika slides.json gagal dimuat - misal CORS error)
    // Edit data ini jika ingin menambah slide tanpa edit slides.json

  },

  // SHOWCASE INTERVAL (Gambar/Slide dari Google Drive)
  // Muncul di sela-sela pergantian halaman jadwal
  roomShowcase: {
    enabled: true,
    interval: 13000, // Durasi per slide (13 detik)
    // Gunakan slides dari Google Drive (sheet "Slides" di Spreadsheet)
    useGoogleDriveSlides: true,
    // Judul default jika slide tidak memiliki title
    defaultTitle: 'Informasi'
  },

  // Debug mode (tampilkan console logs)
  debug: true
};

// Fungsi helper untuk mendapatkan URL CSV export
CONFIG.getCsvUrl = function () {
  return `https://docs.google.com/spreadsheets/d/${this.spreadsheet.id}/export?format=csv&gid=${this.spreadsheet.gid}`;
};

// Fungsi helper untuk mendapatkan URL data source
CONFIG.getDataUrl = function () {
  if (this.spreadsheet.dataSource === 'apps-script') {
    return this.appsScriptUrl;
  } else {
    return this.getCsvUrl();
  }
};

// Export config
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
