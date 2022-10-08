// 设置消息提醒时间 
var MessageTime=4000;
window.onload = function() {
    // 监听id为"file"的控件
    var input = document.getElementById('file');
    input.addEventListener('change', importImage);

    // 监听“encode”控件
    var encodeButton = document.getElementById('encode');
    encodeButton.addEventListener('click', encode);

    // 监听“decode”控件
    var decodeButton = document.getElementById('decode');
    decodeButton.addEventListener('click', decode);
};

// 设置消息最大长度
var maxMessageSize = 3000;

// 在画版上添加图片
var importImage = function(e) {
    var reader = new FileReader();

    reader.onload = function(event) {
        // 设置缩略图
        document.getElementById('preview').style.display = 'block';
        document.getElementById('preview').src = event.target.result;

        // 清空所有消息提示内容
        document.getElementById('message').value = '';
        document.getElementById('password').value = '';
        document.getElementById('password2').value = '';
        document.getElementById('messageDecoded').innerHTML = '';

        // 把数据写入到canvas
        var img = new Image();
        img.onload = function() {
            var ctx = document.getElementById('canvas').getContext('2d');
            ctx.canvas.width = img.width;
            ctx.canvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            decode();
        };
        img.src = event.target.result;
    };

    reader.readAsDataURL(e.target.files[0]);
    //允许重复提交同一文件
    document.getElementById("file").value = null;
};

// 对图片进行encode并保存
var encode = function() {
    var message = document.getElementById('message').value;
    var password = document.getElementById('password').value;
    var output = document.getElementById('output');
    var canvas = document.getElementById('canvas');
    var ctx = canvas.getContext('2d');
    
    //使用提交的密钥对消息进行加密（如果密钥不为空）
    if (password.length > 0) {
        message = sjcl.encrypt(password, message);
    } else {
        message = JSON.stringify({'text': message});
    }
    
    // 如果消息内容长度大于图片能写的实际长度，提前退出
    var pixelCount = ctx.canvas.width * ctx.canvas.height;
    if ((message.length + 1) * 16 > pixelCount * 4 * 0.75) {
        document.getElementById('failMessage').style.display = 'block';
        document.getElementById('MessageContent').innerHTML="消息内容比图片能写入的内容长";
        setTimeout(function() {document.getElementById('failMessage').style.display = 'none';}, MessageTime);
        return;
    }

    // 如果消息长度大于预设的“消息最大长度”，提前退出
    if (message.length > maxMessageSize) {
        document.getElementById('failMessage').style.display = 'block';
        document.getElementById('MessageContent').innerHTML="消息内容太长了";
        setTimeout(function() {document.getElementById('failMessage').style.display = 'none';}, MessageTime);
        return;
    }
    document.getElementById('picPart').style.display = 'block';
    
    // 使用提交的密钥对消息进行加密
    var imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    encodeMessage(imgData.data, sjcl.hash.sha256.hash(password), message);
    console.log("hash值为");
    console.log(sjcl.hash.sha256.hash(password));
    ctx.putImageData(imgData, 0, 0);

    // 展示图片
    document.getElementById('successMessage').style.display = 'block';
    setTimeout(function() {document.getElementById('successMessage').style.display = 'none';}, MessageTime);

    output.src = canvas.toDataURL();

};

// 对图片进行隐写分析，并展示结果
var decode = function() {
    var password = document.getElementById('password2').value;
    var passwordFail = '密钥不正确 或 图片未被隐写';

    // 使用密钥对图片进行解密
    var ctx = document.getElementById('canvas').getContext('2d');
    var imgData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    var message = decodeMessage(imgData.data, sjcl.hash.sha256.hash(password));

    // 解析到json
    var obj = null;
    try {
        obj = JSON.parse(message);
    } catch (e) {
        // 展示用户可以操作的界面部分
        document.getElementById('picPart').style.display = 'none';
        document.getElementById('choose').style.display = 'block';
        document.getElementById('reveal').style.display = 'none';

        if (password.length > 0) {
            document.getElementById('failMessage').style.display = 'block';
            document.getElementById('MessageContent').innerHTML=passwordFail;
            setTimeout(function() {document.getElementById('failMessage').style.display = 'none';}, MessageTime);
        }
    }

    // 展示结果部分
    if (obj) {
        document.getElementById('choose').style.display = 'none';
        document.getElementById('reveal').style.display = 'block';
        document.getElementById('picPart').style.display = 'none';
        
        // 使用提交的密钥对消息进行加密
        if (obj.ct) {
            try {
                obj.text = sjcl.decrypt(password, message);
            } catch (e) {
                document.getElementById('failMessage').style.display = 'block';
                document.getElementById('MessageContent').innerHTML=passwordFail;
                setTimeout(function() {document.getElementById('failMessage').style.display = 'none';}, MessageTime);
            }
        }

        // 设置特殊字符
        var escChars = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            '\'': '&#39;',
            '/': '&#x2F;',
            '\n': '<br/>'
        };
        var escHtml = function(string) {
            return String(string).replace(/[&<>"'\/\n]/g, function (c) {
                return escChars[c];
            });
        };
        document.getElementById('messageDecoded').innerHTML = escHtml(obj.text);
    }
};

// 返回每个像素位置的1或0
var getBit = function(number, location) {
   return ((number >> location) & 1);
};

// 给每个像素位置设置1或0
var setBit = function(number, location, bit) {
   return (number & ~(1 << location)) | (bit << location);
};

// 
// 返回 1 和 0 的数组，表示 2 字节数字
var getBitsFromNumber = function(number) {
   var bits = [];
   for (var i = 0; i < 16; i++) {
       bits.push(getBit(number, i));
   }
   return bits;
};

// 返回下一个 2 字节数字
var getNumberFromBits = function(bytes, history, hash) {
    var number = 0, pos = 0;
    while (pos < 16) {
        var loc = getNextLocation(history, hash, bytes.length);
        var bit = getBit(bytes[loc], 0);
        number = setBit(number, pos, bit);
        pos++;
    }
    return number;
};

// 返回字符串 'message' 的 1 和 0 数组
var getMessageBits = function(message) {
    var messageBits = [];
    for (var i = 0; i < message.length; i++) {
        var code = message.charCodeAt(i);
        messageBits = messageBits.concat(getBitsFromNumber(code));
    }
    return messageBits;
};

// 获取下一个存储位的位置
var getNextLocation = function(history, hash, total) {
    var pos = history.length;
    var loc = Math.abs(hash[pos % hash.length] * (pos + 1)) % total;
    while (true) {
        if (loc >= total) {
            loc = 0;
        } else if (history.indexOf(loc) >= 0) {
            loc++;
        } else if ((loc + 1) % 4 === 0) {
            loc++;
        } else {
            history.push(loc);
            return loc;
        }
    }
};

// 将需要加密的信息，转成canvaPixelArray中对应的像素（颜色）
var encodeMessage = function(colors, hash, message) {
    // 从消息中创建一个bit数组
    var messageBits = getBitsFromNumber(message.length);
    messageBits = messageBits.concat(getMessageBits(message));

    // 储存已经修改好的像素(颜色)
    var history = [];

    // 将位编码为像素
    var pos = 0;
    while (pos < messageBits.length) {
        // 将下一个颜色值设置为下一个位
        var loc = getNextLocation(history, hash, colors.length);
        colors[loc] = setBit(colors[loc], 0, messageBits[pos]);

        // set the alpha value in this pixel to 255
        // we have to do this because browsers do premultiplied alpha
        // see for example: http://stackoverflow.com/q/4309364
        while ((loc + 1) % 4 !== 0) {
            loc++;
        }
        colors[loc] = 255;

        pos++;
    }
};

// 
// 返回以 CanvasPixelArray 'colors' 编码的消息
var decodeMessage = function(colors, hash) {
    // 这将存储我们已经读取的颜色值
    var history = [];

    // 获得消息长度
    var messageSize = getNumberFromBits(colors, history, hash);

    // 消息内容长度大于图片能写的实际长度
    if ((messageSize + 1) * 16 > colors.length * 0.75) {
        return '';
    }

    // 消息内容大于预设的最大长度
    if (messageSize === 0 || messageSize > maxMessageSize) {
        return '';
    }

    // 把字符输出到数组中
    var message = [];
    for (var i = 0; i < messageSize; i++) {
        var code = getNumberFromBits(colors, history, hash);
        message.push(String.fromCharCode(code));
    }

    // 将字符转成json格式
    return message.join('');
};
