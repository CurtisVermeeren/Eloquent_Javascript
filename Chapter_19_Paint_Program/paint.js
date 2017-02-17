// Used to build the DOM takes a class name and attributes
function elt(name, attributes) {
  var node = document.createElement(name);
  if (attributes) {
    for (var attr in attributes)
      if (attributes.hasOwnProperty(attr))
        node.setAttribute(attr, attributes[attr]);
  }
  for (var i = 2; i < arguments.length; i++) {
    var child = arguments[i];
    if (typeof child == "string")
      child = document.createTextNode(child);
    node.appendChild(child);
  }
  return node;
}

// Will hold functions to initialize the contorls below the image
var controls = Object.create(null);

// Appends the paint interface to the DOM element parent
function createPaint(parent) {
  var canvas = elt("canvas", {width: 500, height: 300});
  var cx = canvas.getContext("2d");
  var toolbar = elt("div", {class: "toolbar"});
  // The contorls will have access to the canvas drawing context
  for (var name in controls)
    toolbar.appendChild(controls[name](cx));

  var panel = elt("div", {class: "picturepanel"}, canvas);
  parent.appendChild(elt("div", null, panel, toolbar));
}

// Associates the names of the tools with the function they should use
var tools = Object.create(null);

controls.tool = function(cx) {
  var select = elt("select");
  for (var name in tools)
    select.appendChild(elt("option", null, name));

  // Handles calling the function of the current selected tool
  cx.canvas.addEventListener("mousedown", function(event) {
    if (event.which == 1) {
      tools[select.value](event, cx);
      event.preventDefault();
    }
  });

  return elt("span", null, "Tool: ", select);
};

// Used to find canvas relative coordinates of a mouse event
function relativePos(event, element) {
  var rect = element.getBoundingClientRect();
  return {x: Math.floor(event.clientX - rect.left),
          y: Math.floor(event.clientY - rect.top)};
}

// Several tools need to liston for mousemove events while the mouse is held down
// Takes a function to call for each "mousemove"
// Takes a function to call when the button is released
function trackDrag(onMove, onEnd) {
  function end(event) {
    removeEventListener("mousemove", onMove);
    removeEventListener("mouseup", end);
    if (onEnd)
      onEnd(event);
  }
  addEventListener("mousemove", onMove);
  addEventListener("mouseup", end);
}

// Line tool
tools.Line = function(event, cx, onEnd) {
  // Round lines rather than square
  cx.lineCap = "round";

  // For every "mousemove" with mouse button down a line is
  // drawn from the mouse start to mouse new position
  var pos = relativePos(event, cx.canvas);
  trackDrag(function(event) {
    cx.beginPath();
    cx.moveTo(pos.x, pos.y);
    pos = relativePos(event, cx.canvas);
    cx.lineTo(pos.x, pos.y);
    cx.stroke();
  }, onEnd);
};

// Erase function builds on line tool
tools.Erase = function(event, cx) {
  // Setting to "destination-out" makes pixels transparent again
  cx.globalCompositeOperation = "destination-out";
  tools.Line(event, cx, function() {
	// Default "source-over" means drawn colour is overlaid on existing color
    cx.globalCompositeOperation = "source-over";
  });
};

// Change colors
controls.color = function(cx) {
  // Create a color input
  var input = elt("input", {type: "color"});
  // Listen for the input to change then update values
  input.addEventListener("change", function() {
    cx.fillStyle = input.value;
    cx.strokeStyle = input.value;
  });
  return elt("span", null, "Color: ", input);
};

// Brush sive works similar to color change
controls.brushSize = function(cx) {
  // Create a select element of sizes
  var select = elt("select");
  var sizes = [1, 2, 3, 5, 8, 12, 25, 35, 50, 75, 100];
  sizes.forEach(function(size) {
    select.appendChild(elt("option", {value: size},
                           size + " pixels"));
  });
  // Listen for changes and change the linewidth
  select.addEventListener("change", function() {
    cx.lineWidth = select.value;
  });
  return elt("span", null, "Brush size: ", select);
};


controls.save = function(cx) {
  // Create a link that updates when in focues or hoveredover
  var link = elt("a", {href: "/"}, "Save");
  function update() {
    try {
	  //toDataURL will return a URL that contains the picture on the canvas as an image file
      link.href = cx.canvas.toDataURL();
    } catch (e) {
      if (e instanceof SecurityError)
        link.href = "javascript:alert(" +
          JSON.stringify("Can't save: " + e.toString()) + ")";
      else
        throw e;
    }
  }
  link.addEventListener("mouseover", update);
  link.addEventListener("focus", update);
  return link;
};

// Load an image to the canvas
function loadImageURL(cx, url) {
  var image = document.createElement("img");
  image.addEventListener("load", function() {
    var color = cx.fillStyle, size = cx.lineWidth;
	// Change canvas size to fit the image
    cx.canvas.width = image.width;
    cx.canvas.height = image.height;
	// Draw the image on the context
    cx.drawImage(image, 0, 0);
	// Restore the properties after drawing
    cx.fillStyle = color;
    cx.strokeStyle = color;
    cx.lineWidth = size;
  });
  image.src = url;
}

// Read a file
controls.openFile = function(cx) {
  var input = elt("input", {type: "file"});
  // Listen for change on the file input
  input.addEventListener("change", function() {
	// Read the file
    if (input.files.length == 0) return;
    var reader = new FileReader();
	// Once loaded call loadImageURL
    reader.addEventListener("load", function() {
      loadImageURL(cx, reader.result);
    });
	// Load the file that that user chose as a data URL
    reader.readAsDataURL(input.files[0]);
  });
  return elt("div", null, "Open file: ", input);
};

controls.openURL = function(cx) {
  var input = elt("input", {type: "text"});
  var form = elt("form", null,
                 "Open URL: ", input,
                 elt("button", {type: "submit"}, "load"));
  form.addEventListener("submit", function(event) {
    event.preventDefault();
    loadImageURL(cx, input.value);
  });
  return form;
};

tools.Text = function(event, cx) {
  // Prompt what text string to print
  var text = prompt("Text:", "");
  if (text) {
	// If text is given draw it
    var pos = relativePos(event, cx.canvas);
    cx.font = Math.max(7, cx.lineWidth) + "px sans-serif";
    cx.fillText(text, pos.x, pos.y);
  }
};

// Draws random dots under the brush
tools.Spray = function(event, cx) {
  var radius = cx.lineWidth / 2;
  var area = radius * radius * Math.PI;
  var dotsPerTick = Math.ceil(area / 30);

  var currentPos = relativePos(event, cx.canvas);
  var spray = setInterval(function() {
    for (var i = 0; i < dotsPerTick; i++) {
      var offset = randomPointInRadius(radius);
      cx.fillRect(currentPos.x + offset.x,
                  currentPos.y + offset.y, 1, 1);
    }
  }, 25);
  trackDrag(function(event) {
    currentPos = relativePos(event, cx.canvas);
  }, function() {
    clearInterval(spray);
  });
};

// Get a random point within a radius
function randomPointInRadius(radius) {
  for (;;) {
    var x = Math.random() * 2 - 1;
    var y = Math.random() * 2 - 1;
    if (x * x + y * y <= 1)
      return {x: x * radius, y: y * radius};
  }
}

// Draw a rectangle

// Get dimensions of the rectangle from two points a and b
function rectangleFrom(a, b) {
    return {left: Math.min(a.x, b.x),
            top: Math.min(a.y, b.y),
            width: Math.abs(a.x - b.x),
            height: Math.abs(a.y - b.y)};
  }

  tools.Rectangle = function(event, cx) {
    var relativeStart = relativePos(event, cx.canvas);
    var pageStart = {x: event.pageX, y: event.pageY};

    var trackingNode = document.createElement("div");
    trackingNode.style.position = "absolute";
    trackingNode.style.background = cx.fillStyle;
    document.body.appendChild(trackingNode);

    trackDrag(function(event) {
      var rect = rectangleFrom(pageStart,
                               {x: event.pageX, y: event.pageY});
      trackingNode.style.left = rect.left + "px";
      trackingNode.style.top = rect.top + "px";
      trackingNode.style.width = rect.width + "px";
      trackingNode.style.height = rect.height + "px";
    }, function(event) {
      var rect = rectangleFrom(relativeStart,
                               relativePos(event, cx.canvas));
      cx.fillRect(rect.left, rect.top, rect.width, rect.height);
      document.body.removeChild(trackingNode);
    });
  };

  // Color Picker
  function colorAt(cx, x, y) {
  var pixel = cx.getImageData(x, y, 1, 1).data;
  return "rgb(" + pixel[0] + ", " + pixel[1] + ", " + pixel[2] + ")";
}

tools["Pick color"] = function(event, cx) {
  var pos = relativePos(event, cx.canvas);
  try {
	var color = colorAt(cx, pos.x, pos.y);
  } catch(e) {
	if (e instanceof SecurityError) {
	  alert("Unable to access your picture's pixel data");
	  return;
	} else {
	  throw e;
	}
  }
  cx.fillStyle = color;
  cx.strokeStyle = color;
};

// Call a given function for all horizontal and vertical neighbors
// of the given point.
function forAllNeighbors(point, fn) {
  fn({x: point.x, y: point.y + 1});
  fn({x: point.x, y: point.y - 1});
  fn({x: point.x + 1, y: point.y});
  fn({x: point.x - 1, y: point.y});
}

// Given two positions, returns true when they hold the same color.
function isSameColor(data, pos1, pos2) {
  var offset1 = (pos1.x + pos1.y * data.width) * 4;
  var offset2 = (pos2.x + pos2.y * data.width) * 4;
  for (var i = 0; i < 4; i++) {
	if (data.data[offset1 + i] != data.data[offset2 + i])
	  return false;
  }
  return true;
}

tools["Flood fill"] = function(event, cx) {
  var startPos = relativePos(event, cx.canvas);

  var data = cx.getImageData(0, 0, cx.canvas.width,
							 cx.canvas.height);
  // An array with one place for each pixel in the image.
  var alreadyFilled = new Array(data.width * data.height);

  // This is a list of same-colored pixel coordinates that we have
  // not handled yet.
  var workList = [startPos];
  while (workList.length) {
	var pos = workList.pop();
	var offset = pos.x + data.width * pos.y;
	if (alreadyFilled[offset]) continue;

	cx.fillRect(pos.x, pos.y, 1, 1);
	alreadyFilled[offset] = true;

	forAllNeighbors(pos, function(neighbor) {
	  if (neighbor.x >= 0 && neighbor.x < data.width &&
		  neighbor.y >= 0 && neighbor.y < data.height &&
		  isSameColor(data, startPos, neighbor))
		workList.push(neighbor);
	});
  }
};
