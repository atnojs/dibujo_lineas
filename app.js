document.addEventListener('DOMContentLoaded', () => {
    // --- REFERENCIAS A ELEMENTOS DEL DOM ---
    const imageInput = document.getElementById('image-input');
    const startButton = document.getElementById('start-button');
    const processingSection = document.getElementById('processing-section');
    const previewSection = document.getElementById('preview-section');
    const previewGrid = document.getElementById('preview-grid');
    const progressText = document.getElementById('progress-text');
    const progressBar = document.getElementById('progress-bar');
    const spinnerContainer = document.getElementById('spinner-container');
    const resultsGallery = document.getElementById('results-gallery');
    const galleryTitle = document.querySelector('.gallery-title');
    const errorMessage = document.getElementById('error-message');

    // --- VARIABLES DE ESTADO ---
    let imageQueue = [];
    let generatedImages = [];
    let isProcessing = false;
    let totalImages = 0;
    let processedCount = 0;

    // --- EVENTOS ---

    // 1. Cuando se seleccionan los archivos
    imageInput.addEventListener('change', (event) => {
        if (event.target.files.length > 0) {
            imageQueue = Array.from(event.target.files);
            totalImages = imageQueue.length;
            processedCount = 0;
            startButton.disabled = false;
            startButton.innerHTML = `🚀 Iniciar Procesamiento (${totalImages} imágenes)`;

            // Mostrar vista previa
            showPreview();

            // Limpiar resultados anteriores
            resultsGallery.innerHTML = '';
            generatedImages = [];
            galleryTitle.classList.add('hidden');
            processingSection.classList.add('hidden');
            hideError();
        }
    });

    // 2. Cuando se pulsa el botón para iniciar
    startButton.addEventListener('click', () => {
        if (imageQueue.length > 0 && !isProcessing) {
            isProcessing = true;
            startButton.disabled = true;
            startButton.innerHTML = '⏳ Procesando...';
            processingSection.classList.remove('hidden');
            spinnerContainer.classList.remove('hidden');
            updateProgress();
            processQueue();
        }
    });

    // --- FUNCIÓN: Vista previa ---
    function showPreview() {
        previewGrid.innerHTML = '';
        imageQueue.forEach((file, index) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const item = document.createElement('div');
                item.className = 'preview-item';
                item.innerHTML = `
                    <img src="${e.target.result}" alt="${file.name}" />
                    <button class="remove-preview" onclick="removeImage(${index})">&times;</button>
                `;
                previewGrid.appendChild(item);
            };
            reader.readAsDataURL(file);
        });
        previewSection.classList.remove('hidden');
    }

    // Función para remover imagen de la cola (global para que funcione desde HTML)
    window.removeImage = (index) => {
        imageQueue.splice(index, 1);
        totalImages = imageQueue.length;
        if (totalImages === 0) {
            startButton.disabled = true;
            previewSection.classList.add('hidden');
        } else {
            startButton.innerHTML = `🚀 Iniciar Procesamiento (${totalImages} imágenes)`;
            showPreview();
        }
    };

    // --- LÓGICA DE PROCESAMIENTO ---
    async function processQueue() {
        if (imageQueue.length === 0) {
            isProcessing = false;
            startButton.disabled = false;
            startButton.innerHTML = '✅ ¡Procesamiento Finalizado!';
            spinnerContainer.classList.add('hidden');
            if (generatedImages.length > 0) {
                galleryTitle.classList.remove('hidden');
            }
            return;
        }

        const file = imageQueue.shift();

        try {
            const base64Data = await fileToBase64(file);
            const dimensions = await getImageDimensions(file);
            const aspectRatio = findClosestAspectRatio(dimensions.width, dimensions.height);
            const requestBody = createRequestBody(base64Data, file.type, aspectRatio);

            const response = await fetch('proxy.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || 'Error del servidor.');
            }

            const data = await response.json();
            const imagePart = data.candidates?.[0]?.content?.parts.find(p => p.inlineData);

            if (imagePart) {
                const { data: imageData, mimeType } = imagePart.inlineData;
                const imageUrl = `data:${mimeType};base64,${imageData}`;
                const imageName = `line-art-${file.name.split('.')[0]}.jpg`;

                generatedImages.push({ name: imageName, data: imageData });
                addImageToGallery(imageUrl, imageName, imageData);

                if (generatedImages.length > 0) {
                    galleryTitle.classList.remove('hidden');
                }
            } else {
                throw new Error('La IA no devolvió una imagen');
            }
        } catch (error) {
            showError(`Error con ${file.name}: ${error.message}`);
        } finally {
            processedCount++;
            updateProgress();
            processQueue();
        }
    }

    // --- FUNCIÓN: Agregar imagen a galería con botón de descarga ---
    function addImageToGallery(imageUrl, imageName, imageData) {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.innerHTML = `
            <img src="${imageUrl}" alt="${imageName}" />
            <div class="gallery-item-actions">
                <button class="download-single-btn" onclick="downloadSingleImage('${imageName}', '${imageData}')">
                    💾 Descargar
                </button>
            </div>
        `;
        resultsGallery.appendChild(item);
    }

    // Función para descargar imagen individual (global)
    window.downloadSingleImage = (imageName, imageData) => {
        const link = document.createElement('a');
        link.href = `data:image/jpeg;base64,${imageData}`;
        link.download = imageName;
        link.click();
    };

    // --- FUNCIONES AUXILIARES ---
    function updateProgress() {
        progressText.textContent = `Procesando ${processedCount} de ${totalImages}...`;
        const percentage = totalImages > 0 ? (processedCount / totalImages) * 100 : 0;
        progressBar.style.width = `${percentage}%`;
    }

    const fileToBase64 = file => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = error => reject(error);
    });

    // --- FUNCIÓN: Obtener dimensiones de imagen ---
    const getImageDimensions = file => new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.width, height: img.height });
            img.onerror = () => resolve({ width: 1, height: 1 }); // fallback 1:1
            img.src = e.target.result;
        };
        reader.onerror = () => resolve({ width: 1, height: 1 });
    });

    // --- FUNCIÓN: Encontrar AR más cercano soportado por Gemini ---
    function findClosestAspectRatio(width, height) {
        const supportedRatios = [
            { name: '1:1', value: 1 },
            { name: '3:2', value: 1.5 },
            { name: '2:3', value: 0.6667 },
            { name: '4:3', value: 1.3333 },
            { name: '3:4', value: 0.75 },
            { name: '16:9', value: 1.7778 },
            { name: '9:16', value: 0.5625 },
            { name: '4:5', value: 0.8 },
            { name: '5:4', value: 1.25 },
            { name: '21:9', value: 2.3333 }
        ];

        const imageRatio = width / height;
        let closest = supportedRatios[0];
        let minDiff = Math.abs(imageRatio - closest.value);

        for (const ratio of supportedRatios) {
            const diff = Math.abs(imageRatio - ratio.value);
            if (diff < minDiff) {
                minDiff = diff;
                closest = ratio;
            }
        }

        return closest.name;
    }

    function createRequestBody(base64Data, mimeType, aspectRatio) {
        return {
            contents: [{
                parts: [
                    { inlineData: { data: base64Data, mimeType: mimeType } },
                    {
                        text: `Tu única función es convertir cualquier imagen que el usuario suba en una versión para colorear en blanco y negro, basada en líneas precisas, sin perder ni modificar absolutamente nada del contenido original.

⚠️ Reglas estrictas que debes cumplir:

Fidelidad absoluta:
La imagen resultante debe ser una réplica exacta en trazos de la imagen original.
No se permiten reinterpretaciones, estilizaciones, ni adaptaciones artísticas.
Mismo encuadre y proporciones (aspect ratio):
No recortes, amplíes ni deformes la imagen.
La anchura y altura deben coincidir pixel por pixel con la imagen original.
Superposición perfecta posible:
El usuario debe poder superponer el dibujo sobre la foto original y que coincidan exactamente los contornos.
Esto requiere una conversión técnica tipo "trazado vectorial", no artística.
Respeta milimétricamente el contenido, sin modificar el encuadre ni los detalles y manteniendo las proporciones y los detalles originales con fidelidad exacta al trazado original.

Contorno limpio:
Usa líneas nítidas y bien definidas.
No incluyas rellenos de ningún tipo, sombreado, ni zonas grises.
El fondo debe ser blanco puro.

RECUERDA:
- Mismo tamaño y encuadre que el original
- Trazado por contorno únicamente: rellenos OFF, solo stroke negro uniforme
- Limpieza de huecos y cierre de curvas; fondo #FFFFFF puro
- Entrega en JPG

No generar si no se puede cumplir: haz con la imagen lo que el usuario espera de la mejor manera posible.`
                    },
                ],
            }],
            generationConfig: {
                responseModalities: ["IMAGE"],
                imageConfig: {
                    aspectRatio: aspectRatio
                }
            }
        };
    }

    const showError = message => {
        const errorItem = document.createElement('p');
        errorItem.textContent = message;
        errorMessage.appendChild(errorItem);
        errorMessage.classList.remove('hidden');
    };

    const hideError = () => {
        errorMessage.innerHTML = '';
        errorMessage.classList.add('hidden');
    };
});