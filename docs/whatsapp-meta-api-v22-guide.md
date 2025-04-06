# دليل واجهة برمجة تطبيقات واتساب من ميتا (WhatsApp Business API) - الإصدار 22

## مقدمة

هذا الدليل يوفر معلومات شاملة حول استخدام واجهة برمجة تطبيقات واتساب من ميتا (Meta WhatsApp Cloud API) الإصدار 22، وخاصة في عمليات إرسال واستقبال الرسائل بأنواعها المختلفة.

## جدول المحتويات

1. [أنواع الرسائل المدعومة](#أنواع-الرسائل-المدعومة)
2. [إرسال الرسائل](#إرسال-الرسائل)
   - [إرسال رسائل نصية](#إرسال-رسائل-نصية)
   - [إرسال وسائط](#إرسال-وسائط)
   - [إرسال ردود على رسائل](#إرسال-ردود-على-رسائل)
3. [التعامل مع الوسائط](#التعامل-مع-الوسائط)
   - [رفع ملفات وسائط](#رفع-ملفات-وسائط)
   - [استرجاع وسائط](#استرجاع-وسائط)
   - [أنواع الوسائط المدعومة](#أنواع-الوسائط-المدعومة)
4. [أمثلة عملية](#أمثلة-عملية)
   - [نموذج إرسال رسالة نصية](#نموذج-إرسال-رسالة-نصية)
   - [نموذج إرسال صورة](#نموذج-إرسال-صورة)
   - [نموذج إرسال مستند](#نموذج-إرسال-مستند)

---

## أنواع الرسائل المدعومة

تدعم واجهة برمجة تطبيقات واتساب الأنواع التالية من الرسائل:

- **رسائل نصية (text)**: رسائل تحتوي على نص فقط
- **رسائل وسائط (media)**: تشمل:
  - **صور (image)**: ملفات JPEG وPNG
  - **فيديو (video)**: ملفات MP4 و3GPP
  - **مستندات (document)**: ملفات PDF وWord وExcel وPowerPoint وغيرها
  - **صوت (audio)**: ملفات MP3 وAAC وOGG وغيرها
  - **ملصقات (sticker)**: ملفات WebP الثابتة والمتحركة
- **رسائل موقع (location)**: مشاركة موقع جغرافي
- **رسائل جهات الاتصال (contacts)**: مشاركة جهات اتصال
- **رسائل تفاعلية (interactive)**: رسائل تحتوي على أزرار أو قوائم تفاعلية
- **رسائل قوالب (templates)**: رسائل منسقة مسبقًا ومعتمدة من ميتا
- **رسائل ردود (reactions)**: تفاعلات على رسائل أخرى باستخدام الرموز التعبيرية

---

## إرسال الرسائل

### إرسال رسائل نصية

لإرسال رسالة نصية، يتم استخدام طلب POST إلى نقطة النهاية التالية:

```
POST https://graph.facebook.com/v22.0/FROM_PHONE_NUMBER_ID/messages
```

بنية الطلب:

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "PHONE_NUMBER",
  "type": "text",
  "text": {
    "preview_url": false,
    "body": "نص الرسالة"
  }
}
```

### إرسال وسائط

#### إرسال صورة

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "PHONE_NUMBER",
  "type": "image",
  "image": {
    "id": "MEDIA_OBJECT_ID",
    "caption": "نص الوصف (اختياري)"
  }
}
```

يمكن أيضًا إرسال الصورة عبر رابط:

```json
{
  "messaging_product": "whatsapp",
  "to": "PHONE_NUMBER",
  "type": "image",
  "image": {
    "link": "https://example.com/image.jpg",
    "caption": "نص الوصف (اختياري)"
  }
}
```

#### إرسال فيديو

```json
{
  "messaging_product": "whatsapp",
  "to": "PHONE_NUMBER",
  "type": "video",
  "video": {
    "id": "MEDIA_OBJECT_ID",
    "caption": "نص الوصف (اختياري)"
  }
}
```

#### إرسال مستند

```json
{
  "messaging_product": "whatsapp",
  "to": "PHONE_NUMBER",
  "type": "document",
  "document": {
    "id": "MEDIA_OBJECT_ID",
    "caption": "نص الوصف (اختياري)",
    "filename": "اسم الملف.pdf"
  }
}
```

#### إرسال صوت

```json
{
  "messaging_product": "whatsapp",
  "to": "PHONE_NUMBER",
  "type": "audio",
  "audio": {
    "id": "MEDIA_OBJECT_ID"
  }
}
```

### إرسال ردود على رسائل

لإرسال رد على رسالة محددة، يتم استخدام الصيغة التالية:

```json
{
  "messaging_product": "whatsapp",
  "context": {
    "message_id": "wamid.HBgLMKOVXy..."
  },
  "to": "PHONE_NUMBER",
  "type": "text",
  "text": {
    "body": "نص الرد"
  }
}
```

لإرسال تفاعل (reaction) على رسالة:

```json
{
  "messaging_product": "whatsapp",
  "recipient_type": "individual",
  "to": "PHONE_NUMBER",
  "type": "reaction",
  "reaction": {
    "message_id": "wamid.HBgLM...",
    "emoji": "👍"
  }
}
```

---

## التعامل مع الوسائط

### رفع ملفات وسائط

لرفع ملف وسائط للاستخدام في الرسائل:

```
POST https://graph.facebook.com/v22.0/PHONE_NUMBER_ID/media
```

يمكن رفع الوسائط بطريقتين:

1. **رفع مباشر للملف**:
   ```
   curl -X POST ^
     https://graph.facebook.com/v22.0/PHONE_NUMBER_ID/media ^
     -H "Authorization: Bearer ACCESS_TOKEN" ^
     -F file=@"C:\PATH\TO\FILE" ^
     -F "type=image/jpeg" ^
     -F "messaging_product=whatsapp"
   ```

2. **رفع من خلال رابط**:
   ```
   curl -X POST ^
     https://graph.facebook.com/v22.0/PHONE_NUMBER_ID/media ^
     -H "Authorization: Bearer ACCESS_TOKEN" ^
     -H "Content-Type: application/json" ^
     -d '{
       "messaging_product": "whatsapp",
       "url": "https://EXAMPLE.COM/IMAGE.JPEG",
       "type": "image/jpeg"
     }'
   ```

### استرجاع وسائط

للحصول على رابط الوسائط عبر معرف الوسائط:

```
GET https://graph.facebook.com/v22.0/MEDIA_ID
```

لتنزيل الوسائط:

```
GET https://graph.facebook.com/v22.0/MEDIA_ID/download
```

### أنواع الوسائط المدعومة

#### صوت (Audio)

| نوع الملف | امتداد | نوع MIME | الحجم الأقصى |
|-----------|--------|-----------|--------------|
| AAC       | .aac   | audio/aac | 16 ميجابايت |
| AMR       | .amr   | audio/amr | 16 ميجابايت |
| MP3       | .mp3   | audio/mpeg| 16 ميجابايت |
| MP4 Audio | .m4a   | audio/mp4 | 16 ميجابايت |
| OGG Audio | .ogg   | audio/ogg | 16 ميجابايت |

#### مستندات (Document)

| نوع الملف     | امتداد | نوع MIME | الحجم الأقصى |
|---------------|--------|-----------|--------------|
| نص           | .txt   | text/plain| 100 ميجابايت |
| Excel         | .xls   | application/vnd.ms-excel | 100 ميجابايت |
| Excel         | .xlsx  | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet | 100 ميجابايت |
| Word          | .doc   | application/msword | 100 ميجابايت |
| Word          | .docx  | application/vnd.openxmlformats-officedocument.wordprocessingml.document | 100 ميجابايت |
| PowerPoint    | .ppt   | application/vnd.ms-powerpoint | 100 ميجابايت |
| PowerPoint    | .pptx  | application/vnd.openxmlformats-officedocument.presentationml.presentation | 100 ميجابايت |
| PDF           | .pdf   | application/pdf | 100 ميجابايت |

#### صور (Image)

| نوع الملف | امتداد | نوع MIME | الحجم الأقصى |
|-----------|--------|-----------|--------------|
| JPEG      | .jpeg  | image/jpeg| 5 ميجابايت |
| PNG       | .png   | image/png | 5 ميجابايت |

#### ملصقات (Sticker)

| نوع الملف        | امتداد | نوع MIME | الحجم الأقصى |
|------------------|--------|-----------|--------------|
| ملصق متحرك      | .webp  | image/webp| 500 كيلوبايت |
| ملصق ثابت       | .webp  | image/webp| 100 كيلوبايت |

#### فيديو (Video)

| نوع الملف | امتداد | نوع MIME | الحجم الأقصى |
|-----------|--------|-----------|--------------|
| 3GPP      | .3gp   | video/3gpp| 16 ميجابايت |
| MP4 Video | .mp4   | video/mp4 | 16 ميجابايت |

---

## أمثلة عملية

### نموذج إرسال رسالة نصية

```javascript
const axios = require('axios');

async function sendTextMessage(phoneNumber, message) {
  try {
    const response = await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`,
      headers: {
        'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'text',
        text: {
          preview_url: false,
          body: message
        }
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('خطأ في إرسال الرسالة النصية:', error.response?.data || error.message);
    throw error;
  }
}
```

### نموذج إرسال صورة

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

// وظيفة رفع صورة للحصول على معرف الوسائط
async function uploadImage(imagePath) {
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(imagePath));
    formData.append('type', 'image/jpeg');
    formData.append('messaging_product', 'whatsapp');
    
    const response = await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/media`,
      headers: {
        'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
        ...formData.getHeaders()
      },
      data: formData
    });
    
    return response.data.id;
  } catch (error) {
    console.error('خطأ في رفع الصورة:', error.response?.data || error.message);
    throw error;
  }
}

// وظيفة إرسال صورة باستخدام معرف الوسائط
async function sendImage(phoneNumber, mediaId, caption = '') {
  try {
    const response = await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`,
      headers: {
        'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'image',
        image: {
          id: mediaId,
          caption: caption
        }
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('خطأ في إرسال الصورة:', error.response?.data || error.message);
    throw error;
  }
}

// استخدام الوظائف
async function sendImageMessage(phoneNumber, imagePath, caption) {
  try {
    const mediaId = await uploadImage(imagePath);
    const result = await sendImage(phoneNumber, mediaId, caption);
    console.log('تم إرسال الصورة بنجاح:', result);
    return result;
  } catch (error) {
    console.error('فشل إرسال الصورة:', error);
    throw error;
  }
}
```

### نموذج إرسال مستند

```javascript
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// وظيفة رفع مستند للحصول على معرف الوسائط
async function uploadDocument(filePath) {
  try {
    const fileExtension = path.extname(filePath).toLowerCase();
    let mimeType;
    
    // تحديد نوع MIME بناءً على امتداد الملف
    switch (fileExtension) {
      case '.pdf':
        mimeType = 'application/pdf';
        break;
      case '.doc':
        mimeType = 'application/msword';
        break;
      case '.docx':
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case '.xls':
        mimeType = 'application/vnd.ms-excel';
        break;
      case '.xlsx':
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      case '.txt':
        mimeType = 'text/plain';
        break;
      default:
        mimeType = 'application/octet-stream';
    }
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    formData.append('type', mimeType);
    formData.append('messaging_product', 'whatsapp');
    
    const response = await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/media`,
      headers: {
        'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
        ...formData.getHeaders()
      },
      data: formData
    });
    
    return response.data.id;
  } catch (error) {
    console.error('خطأ في رفع المستند:', error.response?.data || error.message);
    throw error;
  }
}

// وظيفة إرسال مستند باستخدام معرف الوسائط
async function sendDocument(phoneNumber, mediaId, filename, caption = '') {
  try {
    const response = await axios({
      method: 'POST',
      url: `https://graph.facebook.com/v22.0/${process.env.PHONE_NUMBER_ID}/messages`,
      headers: {
        'Authorization': `Bearer ${process.env.ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      },
      data: {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: phoneNumber,
        type: 'document',
        document: {
          id: mediaId,
          caption: caption,
          filename: filename
        }
      }
    });
    
    return response.data;
  } catch (error) {
    console.error('خطأ في إرسال المستند:', error.response?.data || error.message);
    throw error;
  }
}

// استخدام الوظائف
async function sendDocumentMessage(phoneNumber, filePath, caption = '') {
  try {
    const filename = path.basename(filePath);
    const mediaId = await uploadDocument(filePath);
    const result = await sendDocument(phoneNumber, mediaId, filename, caption);
    console.log('تم إرسال المستند بنجاح:', result);
    return result;
  } catch (error) {
    console.error('فشل إرسال المستند:', error);
    throw error;
  }
}
```

---

## ملاحظات هامة

1. **مدة صلاحية الوسائط**: الوسائط المرفوعة عبر واجهة برمجة التطبيقات تبقى متاحة لمدة 30 يوماً فقط ما لم يتم حذفها قبل ذلك.
2. **حدود الرسائل**: هناك قيود على عدد الرسائل التي يمكن إرسالها، وتختلف هذه القيود بناءً على نوع حساب الأعمال.
3. **أمان**: جميع ملفات الوسائط المرسلة عبر واجهة برمجة التطبيقات يتم تشفيرها.
4. **الموافقة على القوالب**: تتطلب رسائل القوالب الحصول على موافقة من ميتا قبل استخدامها.

---

هذا الدليل مستوحى من الوثائق الرسمية لواجهة برمجة تطبيقات واتساب من ميتا الإصدار 22، ويمكن الرجوع إلى الوثائق الرسمية للحصول على مزيد من المعلومات: [WhatsApp Cloud API Documentation](https://developers.facebook.com/docs/whatsapp/cloud-api/).
