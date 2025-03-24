const SemClient = require('../models/SemClient');
const SemMessage = require('../models/SemMessage');
const User = require('../models/User');
const logger = require('../services/loggerService');

/**
 * الحصول على قائمة العملاء حسب صلاحيات المستخدم
 */
exports.getSemClients = async (req, res) => {
    try {
        const { page = 1, limit = 10, searchQuery } = req.query;
        const { userId, userRole } = req.session;
        
        let query = {};
        
        // تطبيق فلتر البحث إذا وجد
        if (searchQuery) {
            query.$or = [
                { name: { $regex: searchQuery, $options: 'i' } },
                { email: { $regex: searchQuery, $options: 'i' } },
                { company: { $regex: searchQuery, $options: 'i' } },
                { phone: { $regex: searchQuery, $options: 'i' } }
            ];
        }
        
        // تطبيق شروط الصلاحيات
        if (userRole === 'admin') {
            // المدير يرى جميع العملاء
        } else if (userRole === 'supervisor') {
            // المشرف يرى العملاء الخاصين به وبالمستخدمين الذين يشرف عليهم
            const supervisedUsers = await User.find({ supervisor: userId }).select('_id');
            const supervisedUserIds = supervisedUsers.map(user => user._id.toString());
            query.$or = [
                { userId },
                { userId: { $in: supervisedUserIds } }
            ];
        } else {
            // المستخدم العادي يرى فقط العملاء الذين أنشأهم
            query.userId = userId;
        }
        
        const options = {
            page: parseInt(page),
            limit: parseInt(limit),
            sort: { createdAt: -1 },
            populate: { path: 'userId', select: 'username name' }
        };
        
        const semClients = await SemClient.paginate(query, options);
        
        return res.status(200).json(semClients);
    } catch (error) {
        logger.error('semClientController', 'Error getting SEM clients', error);
        return res.status(500).json({ message: 'حدث خطأ أثناء استرجاع بيانات العملاء', error: error.message });
    }
};

/**
 * إنشاء عميل جديد
 */
exports.createSemClient = async (req, res) => {
    try {
        const { name, email, phone, company, dailyLimit, monthlyLimit } = req.body;
        const { userId } = req.session;
        
        // التحقق من البريد الإلكتروني
        const existingClient = await SemClient.findOne({ email });
        if (existingClient) {
            return res.status(400).json({ message: 'البريد الإلكتروني مستخدم بالفعل' });
        }
        
        // إنشاء مفتاح API
        const { apiKey } = SemClient.generateApiCredentials();
        
        // إنشاء العميل الجديد
        const newClient = new SemClient({
            name,
            email,
            phone,
            company,
            apiKey,
            userId,
            dailyLimit: dailyLimit || 100,
            monthlyLimit: monthlyLimit || 3000
        });
        
        await newClient.save();
        
        return res.status(201).json({
            message: 'تم إنشاء العميل بنجاح',
            client: {
                _id: newClient._id,
                name: newClient.name,
                email: newClient.email,
                apiKey: newClient.apiKey
            }
        });
    } catch (error) {
        logger.error('semClientController', 'Error creating SEM client', error);
        return res.status(500).json({ message: 'حدث خطأ أثناء إنشاء العميل', error: error.message });
    }
};

/**
 * الحصول على تفاصيل عميل محدد
 */
exports.getSemClientDetails = async (req, res) => {
    try {
        const { clientId } = req.params;
        const { userId, userRole } = req.session;
        
        const client = await SemClient.findById(clientId).populate('userId', 'username name');
        
        if (!client) {
            return res.status(404).json({ message: 'العميل غير موجود' });
        }
        
        // التحقق من الصلاحيات
        if (userRole !== 'admin' && 
            userRole !== 'supervisor' && 
            client.userId.toString() !== userId) {
            return res.status(403).json({ message: 'ليس لديك صلاحيات للوصول إلى هذا العميل' });
        }
        
        // الحصول على إحصائيات الرسائل
        const messageStats = await SemMessage.getClientStats(clientId);
        const dailyStats = await SemMessage.getDailyStats(clientId);
        
        return res.status(200).json({
            client,
            messageStats,
            dailyStats
        });
    } catch (error) {
        logger.error('semClientController', 'Error getting SEM client details', error);
        return res.status(500).json({ message: 'حدث خطأ أثناء استرجاع تفاصيل العميل', error: error.message });
    }
};

/**
 * تحديث بيانات عميل
 */
exports.updateSemClient = async (req, res) => {
    try {
        const { clientId } = req.params;
        const { name, email, phone, company, status, dailyLimit, monthlyLimit } = req.body;
        const { userId, userRole } = req.session;
        
        const client = await SemClient.findById(clientId);
        
        if (!client) {
            return res.status(404).json({ message: 'العميل غير موجود' });
        }
        
        // التحقق من الصلاحيات
        if (userRole !== 'admin' && 
            userRole !== 'supervisor' && 
            client.userId.toString() !== userId) {
            return res.status(403).json({ message: 'ليس لديك صلاحيات لتعديل هذا العميل' });
        }
        
        // التحقق من البريد الإلكتروني
        if (email !== client.email) {
            const existingClient = await SemClient.findOne({ email });
            if (existingClient) {
                return res.status(400).json({ message: 'البريد الإلكتروني مستخدم بالفعل' });
            }
        }
        
        // تحديث بيانات العميل
        client.name = name || client.name;
        client.email = email || client.email;
        client.phone = phone || client.phone;
        client.company = company || client.company;
        
        // الحقول التي يمكن فقط للمدير أو المشرف تغييرها
        if (userRole === 'admin' || userRole === 'supervisor') {
            client.status = status || client.status;
            client.dailyLimit = dailyLimit || client.dailyLimit;
            client.monthlyLimit = monthlyLimit || client.monthlyLimit;
        }
        
        await client.save();
        
        return res.status(200).json({
            message: 'تم تحديث بيانات العميل بنجاح',
            client
        });
    } catch (error) {
        logger.error('semClientController', 'Error updating SEM client', error);
        return res.status(500).json({ message: 'حدث خطأ أثناء تحديث بيانات العميل', error: error.message });
    }
};

/**
 * إعادة توليد مفاتيح API
 */
exports.regenerateApiKeys = async (req, res) => {
    try {
        const { clientId } = req.params;
        const { userId, userRole } = req.session;
        
        const client = await SemClient.findById(clientId);
        
        if (!client) {
            return res.status(404).json({ message: 'العميل غير موجود' });
        }
        
        // التحقق من الصلاحيات
        if (userRole !== 'admin' && 
            userRole !== 'supervisor' && 
            client.userId.toString() !== userId) {
            return res.status(403).json({ message: 'ليس لديك صلاحيات لتعديل هذا العميل' });
        }
        
        // إعادة توليد المفاتيح
        const { apiKey } = SemClient.generateApiCredentials();
        
        client.apiKey = apiKey;
        
        await client.save();
        
        return res.status(200).json({
            message: 'تم إعادة توليد مفاتيح API بنجاح',
            apiKey
        });
    } catch (error) {
        logger.error('semClientController', 'Error regenerating API keys', error);
        return res.status(500).json({ message: 'حدث خطأ أثناء إعادة توليد مفاتيح API', error: error.message });
    }
};

/**
 * حذف عميل
 */
exports.deleteSemClient = async (req, res) => {
    try {
        const { clientId } = req.params;
        const { userId, userRole } = req.session;
        
        const client = await SemClient.findById(clientId);
        
        if (!client) {
            return res.status(404).json({ message: 'العميل غير موجود' });
        }
        
        // التحقق من الصلاحيات (فقط المدير أو المشرف أو منشئ العميل يمكنه الحذف)
        if (userRole !== 'admin' && 
            userRole !== 'supervisor' && 
            client.userId.toString() !== userId) {
            return res.status(403).json({ message: 'ليس لديك صلاحيات لحذف هذا العميل' });
        }
        
        // حذف العميل
        await SemClient.findByIdAndDelete(clientId);
        
        return res.status(200).json({
            message: 'تم حذف العميل بنجاح'
        });
    } catch (error) {
        logger.error('semClientController', 'Error deleting SEM client', error);
        return res.status(500).json({ message: 'حدث خطأ أثناء حذف العميل', error: error.message });
    }
};
