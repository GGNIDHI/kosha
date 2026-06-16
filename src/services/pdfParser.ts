import * as pdfjs from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

// Polyfill ReadableStream async iterator for browser engines (like Safari/WebKit/PWA) that don't support it natively
if (typeof ReadableStream !== 'undefined' && !(ReadableStream.prototype as any)[Symbol.asyncIterator]) {
  (ReadableStream.prototype as any)[Symbol.asyncIterator] = async function* () {
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

// Set up the local PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;

/**
 * Extracts raw text page-by-page from an uploaded PDF file.
 */
export async function extractTextFromPdf(file: File, password?: string): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer, password });
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      // Combine text items with space spacing
      let lastY = -1;
      let pageText = '';
      
      for (const item of textContent.items) {
        if ('str' in item) {
          // If item has a transform, we can detect newlines by looking at Y coordinates.
          // However, joining with space is usually sufficient for LLMs to parse statements.
          const str = item.str;
          const transform = (item as any).transform;
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
    
    return fullText.trim();
  } catch (error: any) {
    if (error && (error.name === 'PasswordException' || error.message?.includes('password'))) {
      if (!password) {
        throw new Error('PasswordRequired');
      } else {
        throw new Error('PasswordIncorrect');
      }
    }
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to extract text from the PDF file.');
  }
}

/**
 * Extracts raw text page-by-page from an uploaded PDF file, returning an array of strings.
 */
export async function extractPagesFromPdf(file: File, password?: string): Promise<string[]> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer, password });
    const pdf = await loadingTask.promise;
    
    const pagesText: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      let lastY = -1;
      let pageText = '';
      
      for (const item of textContent.items) {
        if ('str' in item) {
          const str = item.str;
          const transform = (item as any).transform;
          const currentY = transform ? transform[5] : -1;
          
          if (lastY !== -1 && Math.abs(currentY - lastY) > 5) {
            pageText += '\n';
          }
          
          pageText += str + ' ';
          lastY = currentY;
        }
      }
      
      pagesText.push(pageText.trim());
    }
    
    return pagesText;
  } catch (error: any) {
    if (error && (error.name === 'PasswordException' || error.message?.includes('password'))) {
      if (!password) {
        throw new Error('PasswordRequired');
      } else {
        throw new Error('PasswordIncorrect');
      }
    }
    console.error('Error parsing PDF:', error);
    throw new Error('Failed to extract text from the PDF file.');
  }
}

/**
 * Renders a PDF page to a canvas element for preview.
 */
export async function renderPdfPageToCanvas(
  file: File,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  password?: string
): Promise<void> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer, password });
    const pdf = await loadingTask.promise;
    
    if (pageNumber < 1 || pageNumber > pdf.numPages) {
      throw new Error(`Page number ${pageNumber} out of range (1-${pdf.numPages})`);
    }
    
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1.5 });
    
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    const canvasContext = canvas.getContext('2d');
    if (!canvasContext) {
      throw new Error('Could not get 2D context for canvas');
    }
    
    const renderContext = {
      canvasContext,
      viewport
    };
    
    await page.render(renderContext as any).promise;
  } catch (error: any) {
    if (error && (error.name === 'PasswordException' || error.message?.includes('password'))) {
      if (!password) {
        throw new Error('PasswordRequired');
      } else {
        throw new Error('PasswordIncorrect');
      }
    }
    console.error('Error rendering PDF page:', error);
    throw new Error('Failed to render PDF page preview.');
  }
}

/**
 * Gets the total page count of a PDF file.
 */
export async function getPdfPageCount(file: File): Promise<number> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    return pdf.numPages;
  } catch (error) {
    console.error('Error getting page count:', error);
    return 0;
  }
}
