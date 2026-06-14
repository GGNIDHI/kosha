import fs from 'fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// Polyfill ReadableStream async iterator for environments/engines that don't support it natively
if (typeof ReadableStream !== 'undefined' && !ReadableStream.prototype[Symbol.asyncIterator]) {
  ReadableStream.prototype[Symbol.asyncIterator] = async function* () {
    const reader = this.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) return;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  };
}

const pdfPath = './PDF1.pdf';
const password = process.argv[2] || undefined;

async function run() {
  console.log(`Loading PDF: ${pdfPath}...`);
  try {
    const fileBuffer = fs.readFileSync(pdfPath);
    const data = new Uint8Array(fileBuffer);
    const loadingTask = pdfjs.getDocument({ data, password });
    
    const pdf = await loadingTask.promise;
    console.log(`PDF loaded successfully! Total Pages: ${pdf.numPages}`);
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      console.log(`Reading Page ${i}...`);
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      let lastY = -1;
      let pageText = '';
      
      for (const item of textContent.items) {
        if ('str' in item) {
          const str = item.str;
          const transform = item.transform;
          const currentY = transform ? transform[5] : -1;
          
          if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
            pageText += '\n';
          }
          
          pageText += str + ' ';
          lastY = currentY;
        }
      }
      
      fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }
    
    console.log('\n=================== EXTRACTED TEXT (FIRST 1000 CHARACTERS) ===================');
    console.log(fullText.substring(0, 1000));
    console.log('=============================================================================');
    console.log(`\nSuccess! Extracted a total of ${fullText.length} characters.`);
    
  } catch (error) {
    if (error && (error.name === 'PasswordException' || error.message?.includes('password'))) {
      console.error('\n❌ [PASSWORD REQUIRED] This PDF is password-protected.');
      console.error('Run the script with the password:');
      console.error('  node test_parser.js <your_password>\n');
    } else {
      console.error('❌ Error occurred while parsing PDF:', error);
    }
  }
}

run();
