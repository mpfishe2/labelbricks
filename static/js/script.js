function initCanvas() {
    const canvas = new fabric.Canvas('canvas');
    let isDrawingMode = false;

    // Function to load the image onto the canvas
    function loadImage(imagePath) {
        console.log(imagePath)
        canvas.clear();
        fabric.Image.fromURL(imagePath, function(img) {
            img.scaleToWidth(800); // Adjust image size as needed
            canvas.setWidth(img.getScaledWidth());
            canvas.setHeight(img.getScaledHeight());
            canvas.add(img);
            canvas.sendToBack(img);
        });
    }

    // Function to fetch the image from cloud storage
    function fetchImageFromCloud(filePath) {
        fetch(`/fetch_image?file_path=${encodeURIComponent(filePath)}`)
            .then(response => response.json())
            .then(data => {
                if (data.image_path) {
                    loadImage(data.image_path);
                } else {
                    alert('Failed to load image from cloud.');
                }
            })
            .catch(error => console.error('Error:', error));
    }

    // Attach functions to the window object to make them globally accessible
    window.loadImage = loadImage;
    window.fetchImageFromCloud = fetchImageFromCloud;

    // Enable and disable drawing mode
    const toggleDrawingButton = document.getElementById('toggle-drawing');
    toggleDrawingButton.addEventListener('click', function() {
        isDrawingMode = !isDrawingMode;
        canvas.isDrawingMode = isDrawingMode;
        toggleDrawingButton.innerText = isDrawingMode ? "Disable Drawing" : "Enable Drawing";
    });

    // Save annotations and the combined image
    document.getElementById('save').addEventListener('click', function() {
        // const description = document.getElementById('description').value;
        const volumePath = document.getElementById('volumePath').innerText;
        console.log("volumePath");
        console.log(volumePath);
        const imageDataURL = canvas.toDataURL(); // Convert the canvas to a data URL

        // Send data to the server
        fetch('/save_annotations', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // body: JSON.stringify({ image: imageDataURL, description: description, volumePath: volumePath  })
            body: JSON.stringify({ image: imageDataURL, volumePath: volumePath  })
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                alert('Annotations and image saved successfully!');
            }
        });
    });
}