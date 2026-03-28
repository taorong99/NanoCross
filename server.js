const express = require('express');
const fs = require('fs');
const th = require('path');

const app = express();
const port = 3080; // 换一个端口避免和 Live Server (3000) 冲突

// 解析 JSON requests
app.use(express.json({ limit: '50mb' }));

// 托管前端静态文件 (以当前目录为根目录)
app.use(express.static(__dirname));

// 确保 designs 文件夹存在
const designsDir = path.join(__dirname, 'designs');
if (!fs.existsSync(designsDir)) {
    fs.mkdirSync(designsDir);
}

// 获取项目列表 API
app.get('/api/designs', (req, res) => {
    fs.readdir(designsDir, (err, files) => {
        if (err) return res.status(500).send('读取项目目录失败');
        const projects = files
            .filter(f => f.endsWith('.json'))
            .map(f => f.replace('.json', ''));
        res.json(projects);
    });
});

// 读取指定项目 API
app.get('/api/load/:name', (req, res) => {
    const filePath = path.join(designsDir, req.params.name + '.json');
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('项目文件不存在');
    }
    res.sendFile(filePath);
});

// 保存项目 API
app.post('/api/save', (req, res) => {
    const { projectName } = req.body;
    if (!projectName) return res.status(400).send('保存失败：未提供项目名称');
    
    // 清理文件名中可能不合法的字符
    const safeName = projectName.replace(/[\/\?<>\\:\*\|":]/g, '');
    const filePath = path.join(designsDir, safeName + '.json');
    
    fs.writeFile(filePath, JSON.stringify(req.body, null, 2), 'utf8', (err) => {
        if (err) return res.status(500).send('服务器写入文件失败: ' + err.message);
        res.send('ok');
    });
});

app.listen(port, () => {
    console.log(`NanoSim 后端服务已启动！访问地址: http://localhost:${port}`);
    console.log(`项目数据将自动存储至: ${designsDir}`);
});
