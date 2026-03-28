//作者devil
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'

const REPO_API_URL = 'https://api.github.com/repos/iaoongin/GachaClock/contents/spider/data/zzz';
const RAW_BASE_URL = 'https://raw.githubusercontent.com/iaoongin/GachaClock/main/spider/data/zzz/';
const FALLBACK_URL = RAW_BASE_URL + 'history.json';

const ALIAS_SOURCES = [
    'https://raw.githubusercontent.com/ZZZure/ZZZ-Plugin/main/defSet/alias.yaml',
    'https://raw.githubusercontent.com/Nwflower/zzz-atlas/master/othername/Role.yaml',
    'https://raw.githubusercontent.com/Nwflower/zzz-atlas/master/othername/Bangboo.yaml',
    'https://raw.githubusercontent.com/Nwflower/zzz-atlas/master/othername/音擎.yaml',
    'https://raw.githubusercontent.com/Nwflower/zzz-atlas/master/othername/Drive Disc.yaml'
];

const GAME_CONFIG = {
    prefixes: ['#绝区零', '%', '绝区零'],
    name: '绝区零',
    type: '调频'
};

// 【核心防伪：全服已知A级图鉴】
const KNOWN_A_RANKS = new Set([
    "安比", "妮可", "比利", "可琳", "安东", "本", "苍角", "露西", "派派", "赛斯", "真斗", "波可娜", "潘引壶",
    "旋钻机-赤轴", "含羞恶面", "比格气缸", "聚宝箱", "仿制星徽引擎", "家政员", 
    "德玛拉电池Ⅱ型", "维序者-特化型", "轰鸣座驾", "好斗的阿炮", "裁纸刀", 
    "震元奇枢", "燔火胧夜", "双生泣星", "时间切片", "街头巨星", "正版星徽引擎", 
    "左轮转子", "贵重骨核", "春日融融", "巨浪气缸", "电磁炉", "玩具手枪"
]);

// 【完美对齐】用户手动校正的时间轴推演罗盘
const VERSION_TIMELINE = [
    { d: '2024/07/04', v: '1.0上半' }, { d: '2024/07/24', v: '1.0下半' },
    { d: '2024/08/14', v: '1.1上半' }, { d: '2024/09/04', v: '1.1下半' },
    { d: '2024/09/25', v: '1.2上半' }, { d: '2024/10/16', v: '1.2下半' },
    { d: '2024/11/06', v: '1.3上半' }, { d: '2024/11/27', v: '1.3下半' },
    { d: '2024/12/18', v: '1.4上下半' },
    { d: '2025/01/22', v: '1.5上半' }, { d: '2025/02/12', v: '1.5下半' },
    { d: '2025/03/12', v: '1.6上半' }, { d: '2025/04/02', v: '1.6下半' },
    { d: '2025/04/23', v: '1.7上半' }, { d: '2025/05/14', v: '1.7下半' },
    { d: '2025/06/06', v: '2.0上半' }, { d: '2025/06/25', v: '2.0下半' },
    { d: '2025/07/16', v: '2.1上半' }, { d: '2025/08/06', v: '2.1下半' },
    { d: '2025/09/04', v: '2.2上半' }, { d: '2025/09/24', v: '2.2下半' },
    { d: '2025/10/15', v: '2.3上半' }, { d: '2025/11/05', v: '2.3下半' },
    { d: '2025/11/26', v: '2.4上半' }, { d: '2025/12/17', v: '2.4下半' },
    { d: '2025/12/30', v: '2.5上半' }, { d: '2026/01/21', v: '2.5下半' }, 
    { d: '2026/02/06', v: '2.6上半' }, { d: '2026/03/04', v: '2.6下半' },
    { d: '2026/03/24', v: '2.7上半' }, { d: '2026/04/13', v: '2.7下半' }
].map(x => ({ time: new Date(x.d + ' 00:00:00').getTime(), v: x.v })).sort((a, b) => a.time - b.time);

export class CardPoolQuery extends plugin {
    constructor() {
        super({
            name: "卡池查询",
            dsc: "查询绝区零全角色/武器卡池记录",
            event: "message",
            priority: -114514,
            rule: [
                { reg: '复刻统计', fnc: 'dispatchHandler' },
                { reg: '卡池$', fnc: 'dispatchVersionHandler' },
                { reg: '(当前|本期|当期)卡池$', fnc: 'queryCurrentPool' }
            ]
        });
        
        this.aliasMap = null;
    }

    async getAliasMap() {
        if (this.aliasMap) return this.aliasMap;
        let finalMap = {};
        let loadedSources = 0;
        const zzzPaths = [
            path.join(process.cwd(), 'plugins', 'ZZZ-Plugin', 'config', 'alias.yaml'),
            path.join(process.cwd(), 'plugins', 'ZZZ-Plugin', 'defSet', 'alias.yaml'),
            path.join(process.cwd(), 'plugins', 'zzz-plugin', 'defSet', 'alias.yaml')
        ];
        for (const filePath of zzzPaths) { if (this.mergeLocalYaml(filePath, finalMap)) loadedSources++; }
        const atlasDirs = [
            path.join(process.cwd(), 'plugins', 'Atlas', 'othername'),
            path.join(process.cwd(), 'plugins', 'zzz-atlas', 'othername'),
            path.join(process.cwd(), 'plugins', 'Atlas', 'zzz-atlas', 'othername'),
            path.join(process.cwd(), 'plugins', 'Atlas', 'zzz-atlas', 'config'),
            path.join(process.cwd(), 'plugins', 'Nwflower-zzz-atlas', 'othername')
        ];
        for (const dirPath of atlasDirs) { if (this.mergeLocalDir(dirPath, finalMap)) loadedSources++; }
        if (loadedSources === 0 || !this.checkKeyExists(finalMap, '般岳')) { 
            for (const url of ALIAS_SOURCES) { await this.mergeRemoteYaml(encodeURI(url), finalMap); }
        }
        this.aliasMap = finalMap;
        return this.aliasMap;
    }

    checkKeyExists(map, keyword) { return Object.keys(map).some(k => k.includes(keyword)); }

    mergeLocalDir(dirPath, targetMap) {
        try {
            if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
                const files = fs.readdirSync(dirPath);
                let mergedCount = 0;
                for (const file of files) {
                    if (file.endsWith('.yaml') || file.endsWith('.yml')) {
                        if (this.mergeLocalYaml(path.join(dirPath, file), targetMap)) mergedCount++;
                    }
                }
                return mergedCount > 0;
            }
        } catch (err) { }
        return false;
    }

    mergeLocalYaml(filePath, targetMap) {
        try {
            if (fs.existsSync(filePath)) {
                const content = fs.readFileSync(filePath, 'utf-8');
                this.mergeMaps(targetMap, this.parseYamlSimple(content));
                return true;
            }
        } catch (err) { }
        return false;
    }

    async mergeRemoteYaml(url, targetMap) {
        try {
            const response = await fetch(url, { timeout: 3000 });
            if (response.ok) {
                const text = await response.text();
                this.mergeMaps(targetMap, this.parseYamlSimple(text));
            }
        } catch (err) { }
    }

    mergeMaps(target, source) {
        for (const [key, aliases] of Object.entries(source)) {
            if (!target[key]) target[key] = aliases;
            else target[key] = Array.from(new Set([...target[key], ...aliases]));
        }
    }

    parseYamlSimple(yamlStr) {
        const result = {};
        const lines = yamlStr.split(/\r?\n/);
        let currentKey = null;
        lines.forEach(line => {
            const rawLine = line.trimEnd(); 
            const trimmedLine = rawLine.trim();
            if (!trimmedLine || trimmedLine.startsWith('#')) return;
            const keyMatch = rawLine.match(/^\s*['"]?(.+?)['"]?:\s*$/);
            if (keyMatch) {
                currentKey = keyMatch[1];
                if (!result[currentKey]) result[currentKey] = [];
                return;
            }
            const valMatch = rawLine.match(/^\s*-\s+['"]?(.+?)['"]?$/);
            if (currentKey && valMatch) {
                if (!result[currentKey].includes(valMatch[1])) result[currentKey].push(valMatch[1]);
            }
        });
        return result;
    }

    normalizeNameSync(inputName, map) {
        if (!inputName || map[inputName]) return inputName;
        const lowerInput = inputName.toLowerCase();
        for (const [realName, aliases] of Object.entries(map)) {
            if (realName.toLowerCase() === lowerInput || aliases.some(a => a.toLowerCase() === lowerInput)) return realName;
        }
        return inputName;
    }

    async dispatchHandler(e) {
        const rawContent = this.parsePrefix(e.msg);
        if (!rawContent) return false;
        try {
            const upperContent = rawContent.toUpperCase();
            if (['五星复刻统计', '复刻统计', 'S级复刻统计', '角色复刻统计', 'S级角色复刻统计'].includes(upperContent)) return await this.handleSummary(e, 'S', '角色');
            if (['五星武器复刻统计', '五星音擎复刻统计', 'S级音擎复刻统计', '武器复刻统计', '音擎复刻统计', 'S级武器复刻统计'].includes(upperContent)) return await this.handleSummary(e, 'S', '武器');
            if (['四星复刻统计', '四星角色复刻统计', 'A级复刻统计', 'A级角色复刻统计'].includes(upperContent)) return await this.handleSummary(e, 'A', '角色');
            if (['四星武器复刻统计', '四星音擎复刻统计', 'A级音擎复刻统计', 'A级武器复刻统计'].includes(upperContent)) return await this.handleSummary(e, 'A', '武器');
            const match = rawContent.match(/^(.*?)复刻统计$/);
            if (match && match[1]) {
                const rawName = match[1].trim();
                const officialName = this.normalizeNameSync(rawName, await this.getAliasMap());
                return await this.handleHistoryQuery(e, officialName, rawName);
            }
            return false;
        } catch (err) { return e.reply(`插件运行出错: ${err.message}`); }
    }

    async dispatchVersionHandler(e) {
        const content = this.parsePrefix(e.msg);
        if (!content) return false;
        if (['当前卡池', '本期卡池', '当期卡池'].includes(content)) return await this.queryCurrentPool(e);
        const match = content.match(/^v?(\d+\.\d+)(上半|下半|上下半)?卡池$/);
        if (match) return await this.handleVersionQuery(e, match[1], match[2]);
        return false;
    }

    parsePrefix(msg) {
        msg = msg.trim();
        for (const p of GAME_CONFIG.prefixes) { if (msg.startsWith(p)) return msg.substring(p.length).trim(); }
        return null;
    }

    async queryCurrentPool(e) {
        let data = await this.fetchData();
        if (!data) return e.reply('数据源连接失败');
        const now = new Date();
        let activePools = data.filter(pool => {
            const { startTime, endTime } = this.parseTimer(pool.timer);
            return startTime && endTime && now >= startTime && now <= endTime;
        });

        if (activePools.length === 0) {
            data = await this.fetchData(true);
            if (data) {
                activePools = data.filter(pool => {
                    const { startTime, endTime } = this.parseTimer(pool.timer);
                    return startTime && endTime && now >= startTime && now <= endTime;
                });
            }
        }

        if (activePools.length === 0) return e.reply('当前没有正在进行的活动卡池。');

        let replyMsg = `╭══ 📅 当前卡池概览 ══╮\n`;
        if (activePools.length > 0) {
            const sample = activePools[0];
            const { endTime } = this.parseTimer(sample.timer);
            const remainingDays = Math.ceil((endTime - now) / (1000 * 60 * 60 * 24));
            const timerStr = (sample.timer || '').replace(/ \d{2}:\d{2}:\d{2}/g, '').replace(' ~ ', '~');
            replyMsg += `🏷️ 版本：v${sample._version}\n⏰ 时间：${timerStr}\n⏳ 状态：剩余约 ${remainingDays} 天\n╰═════════════╯\n`;
        }
        
        const roles = activePools.filter(p => p._type === '角色');
        if (roles.length > 0) {
            replyMsg += `【🎮 角色调频】\n`;
            replyMsg += ` ◈ 角色：\n   ${roles.map(p => `S-${p._s.join(', ')} | A-${p._a.length>0 ? p._a.join(', ') : '无'}`).join('\n   ')}\n`;
        }
        
        const weapons = activePools.filter(p => p._type === '武器');
        if (weapons.length > 0) {
            replyMsg += `\n【💿 音擎调频】\n`;
            replyMsg += ` ◈ 音擎：\n   ${weapons.map(p => `S-${p._s.join(', ')} | A-${p._a.length>0 ? p._a.join(', ') : '无'}`).join('\n   ')}\n`;
        }
        return e.reply(replyMsg.trim());
    }

    async handleVersionQuery(e, version, phase) {
        let data = await this.fetchData();
        if (!data) return e.reply('数据源连接失败');
        
        let pools = data.filter(pool => {
            if (!pool._version.includes(version)) return false;
            return !phase || pool._version.includes(phase);
        });

        if (pools.length === 0) {
            data = await this.fetchData(true);
            if (data) {
                pools = data.filter(pool => {
                    if (!pool._version.includes(version)) return false;
                    return !phase || pool._version.includes(phase);
                });
            }
        }

        if (pools.length === 0) return e.reply(`未查询到 ${version}${phase || ''} 版本的卡池数据。`);

        const versionStages = [...new Set(pools.map(p => p._version))].sort((a, b) => {
            if (a.includes('上半') && b.includes('下半')) return -1;
            if (a.includes('下半') && b.includes('上半')) return 1;
            return a.localeCompare(b);
        });

        let replyMsg = `╭══ 🏷️ 绝区零 v${version} 卡池 ══╮\n`;
        for (const stage of versionStages) {
            const stagePools = pools.filter(p => p._version === stage);
            let timerDisplay = stagePools[0]?.timer?.replace(/ \d{2}:\d{2}:\d{2}/g, '').replace(' ~ ', '~') || '';
            replyMsg += `\n【${stage}】\n⏰ ${timerDisplay}\n`;
            
            const roles = stagePools.filter(p => p._type === '角色');
            if (roles.length > 0) {
                replyMsg += ` ◈ 角色：\n   ${roles.map(p => `S-${p._s.join(', ')} | A-${p._a.length>0 ? p._a.join(', ') : '无'}`).join('\n   ')}\n`;
            }
            const weapons = stagePools.filter(p => p._type === '武器');
            if (weapons.length > 0) {
                replyMsg += ` ◈ 音擎：\n   ${weapons.map(p => `S-${p._s.join(', ')} | A-${p._a.length>0 ? p._a.join(', ') : '无'}`).join('\n   ')}\n`;
            }
        }
        return e.reply(replyMsg.trim());
    }

    async handleSummary(e, targetRank, targetType) {
        const data = await this.fetchData();
        if (!data) return e.reply('数据源连接失败');
        const now = new Date();
        const itemMap = new Map();
        data.forEach(pool => {
            if (pool._type !== targetType) return;
            const { startTime, endTime } = this.parseTimer(pool.timer);
            if (!startTime || !endTime) return;
            let targets = targetRank === 'S' ? pool._s : pool._a;
            targets.forEach(name => {
                if (!itemMap.has(name) || endTime > itemMap.get(name).endTime) itemMap.set(name, { startTime, endTime });
            });
        });
        const currentList = [];
        const historyList = [];
        itemMap.forEach((timeInfo, name) => {
            if (now >= timeInfo.startTime && now <= timeInfo.endTime) currentList.push(name);
            else if (now > timeInfo.endTime) historyList.push({ name, days: Math.floor((now - timeInfo.endTime) / (1000 * 60 * 60 * 24)) });
        });
        historyList.sort((a, b) => b.days - a.days);
        const displayType = targetType === '武器' ? '音擎' : '角色';
        
        let titleName = `${targetRank}级${displayType}复刻排行`;
        if (targetRank === 'A' && displayType === '角色') titleName = `A级角色复刻排行`;
        if (targetRank === 'A' && displayType === '音擎') titleName = `A级音擎排行`;

        let replyMsg = `╭══ 📊 ${titleName} ══╮\n✨ 当前UP: ${currentList.join(', ') || '暂无'}\n╰═════════════╯\n`;
        replyMsg += historyList.map((r, i) => `[${String(i + 1).padStart(2, '0')}] ${r.name} : 已隔 ${r.days} 天`).join('\n');
        return e.reply(replyMsg);
    }

    async handleHistoryQuery(e, queryName, rawInputName) {
        let data = await this.fetchData();
        if (!data) return e.reply('数据获取失败。');
        
        let records = data.filter(pool => pool._s.includes(queryName) || pool._a.includes(queryName));
        
        if (records.length === 0) {
            data = await this.fetchData(true);
            if (data) {
                records = data.filter(pool => pool._s.includes(queryName) || pool._a.includes(queryName));
            }
        }

        if (records.length === 0) return e.reply(`未找到 [${rawInputName}] 的记录。\n请确认名称是否正确。`);

        const uniqueRecords = [];
        const seenTime = new Set();
        for (const r of records) {
            if (!seenTime.has(r._endTimeStamp)) { seenTime.add(r._endTimeStamp); uniqueRecords.push(r); }
        }
        records = uniqueRecords;

        const firstHit = records[0];
        let replyMsg = `╭══ 🔍 ${queryName} 历史卡池 ══╮\n✨ 评级: ${firstHit._s.includes(queryName) ? 'S级' : 'A级'} | 📦 类型: ${firstHit._type === '武器' ? '音擎' : '角色'}\n╰═════════════╯\n`;
        replyMsg += records.map((pool, i) => `[第${i + 1}次] v${pool._version}\n ⏰ ${pool.timer.replace(/ \d{2}:\d{2}:\d{2}/g, '').replace(' ~ ', '~')}`).join('\n\n');
        return e.reply(replyMsg);
    }

    parseTimer(timerStr) {
        if (!timerStr || typeof timerStr !== 'string') return { startTime: null, endTime: null };
        const parts = timerStr.split('~');
        if (parts.length < 2) return { startTime: null, endTime: null };
        let startTime = new Date(parts[0].trim()), endTime = new Date(parts[1].trim());
        return { startTime: isNaN(startTime.getTime()) ? null : startTime, endTime: isNaN(endTime.getTime()) ? null : endTime };
    }

    // ================= 极速实时读写与绝对优先级 =================
    async fetchData(forceFetch = false) {
        const now = Date.now();
        let localBase = [];
        let lastModified = 0;
        const dataPath = path.join(process.cwd(), 'data', 'zzz_full_history.json');
        
        // 1. 永远先读取本地硬盘文件 (如果你修改了JSON，这里立刻读到最新内容)
        if (fs.existsSync(dataPath)) {
            try {
                localBase = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
                lastModified = fs.statSync(dataPath).mtimeMs;
            } catch (err) {
                logger.error(`[卡池查询] 读取本地底库失败: ${err.message}`);
            }
        }

        let needRemote = true;
        // 2. 本地绝对优先级判定
        if (!forceFetch) {
            // 只要本地有数据，并且距离上次文件修改不到 2 小时，绝对不碰网络！直接秒回
            if (localBase.length > 0 && (now - lastModified < 2 * 60 * 60 * 1000)) {
                needRemote = false;
            }
        }

        // 触发极速响应，即改即生效
        if (!needRemote) {
            return localBase;
        }

        // 3. 只有超过两小时，或者本地查不到强制触发时，才会走到这里请求远端
        let allData = [];
        const localEndTimes = new Set();
        
        // 建立最严密的覆盖护盾：提取本地 JSON 里已有的所有卡池结束时间
        localBase.forEach(p => {
            const t = p._endTimeStamp || (p.timer ? new Date(p.timer.split('~')[1].trim()).getTime() : 0);
            const type = p._type || (String(p.type || '').includes('角色') ? '角色' : '武器');
            if (t) localEndTimes.add(`${type}_${t}`);
        });

        try {
            const dirRes = await fetch(REPO_API_URL, { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/vnd.github.v3+json' }, timeout: 15000 });
            if (dirRes.ok) {
                const fileNames = (await dirRes.json()).filter(f => f.type === 'file' && /^\d+_\d+.*\.json$/.test(f.name)).map(f => f.name);
                for (let i = 0; i < fileNames.length; i += 5) {
                    const batch = fileNames.slice(i, i + 5).map(async name => {
                        const res = await fetch(RAW_BASE_URL + name);
                        if (res.ok) { 
                            const json = await res.json(); 
                            const arr = Array.isArray(json) ? json : [json];
                            arr.forEach(remotePool => {
                                let timerRaw = remotePool.timer;
                                if (Array.isArray(timerRaw)) timerRaw = timerRaw.join(' ~ ');
                                if (!timerRaw && remotePool.start && remotePool.end) timerRaw = `${remotePool.start} ~ ${remotePool.end}`;
                                if (!timerRaw || !String(timerRaw).includes('~')) return;

                                const parts = String(timerRaw).split('~');
                                if (parts.length < 2) return;
                                
                                const t = new Date(parts[1].trim()).getTime();
                                let rawType = String(remotePool.type || remotePool.pool_type || '').toLowerCase();
                                let pType = rawType.includes('角色') || rawType === 'character' ? '角色' : '武器';
                                
                                // 【终极防覆盖】：只要发现本地已经存在这个时间段的卡池，直接无情抛弃远端的垃圾数据！
                                if (!localEndTimes.has(`${pType}_${t}`)) {
                                    allData.push(remotePool);
                                }
                            });
                        }
                    });
                    await Promise.all(batch);
                }
            }
        } catch (err) { 
            logger.error(`[卡池查询] 远程更新检查失败: ${err.message}`);
        }
        
        const aliasMap = await this.getAliasMap();
        
        // 将本地最高优先级的纯净数据 + 洗好的新远程数据 合并
        allData.push(...localBase);
        
        allData = this.preprocessData(allData, aliasMap);
        
        const uniqueData = [], seen = new Set();
        for (const p of allData) {
            const key = `${p._type}_${p._endTimeStamp}_${p._s[0] || 'Unknown'}`;
            if (!seen.has(key)) { seen.add(key); uniqueData.push(p); }
        }
        
        // 覆写文件，彻底迭代更新本地 JSON
        try {
            const dataDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(dataPath, JSON.stringify(uniqueData, null, 2), 'utf-8');
        } catch (err) { }

        return uniqueData;
    }

    preprocessData(data, aliasMap) {
        data.forEach(pool => {
            let timerStr = Array.isArray(pool.timer) ? pool.timer.join(' ~ ') : (pool.timer || (pool.start && pool.end ? `${pool.start} ~ ${pool.end}` : ""));
            pool.timer = timerStr;
            let rawType = String(pool.type || pool.pool_type || '').toLowerCase();
            pool._type = rawType.includes('角色') || rawType === 'character' ? '角色' : '武器';
            
            // 无论是本地已经洗白的数据，还是远端的乱序数据，统统过一遍
            let sRaw = pool.s || pool.up5 || pool['5'] || pool._s || [];
            let aRaw = pool.a || pool.up4 || pool['4'] || pool._a || [];
            let gachas = pool.gachas || [];
            
            let allNames = [];
            if (sRaw) allNames.push(...(Array.isArray(sRaw) ? sRaw : [sRaw]));
            if (aRaw) allNames.push(...(Array.isArray(aRaw) ? aRaw : [aRaw]));
            if (gachas.length > 0) allNames.push(...gachas);

            let parsedS = [];
            let parsedA = [];
            let seenNames = new Set();

            const extractName = (item) => {
                if (typeof item === 'object' && item !== null) return item.title || item.name || '';
                return String(item);
            };

            allNames.forEach(item => {
                let name = extractName(item).replace(/[「」【】]/g, '').trim();
                if (!name || seenNames.has(name)) return;
                seenNames.add(name);
                
                let normName = this.normalizeNameSync(name, aliasMap);
                if (KNOWN_A_RANKS.has(normName)) {
                    parsedA.push(name);
                } else {
                    // 非 A 级（比如你手动在 json 里加的角色/武器），都会完美保存到 S 级里
                    parsedS.push(name);
                }
            });

            if (parsedS.length === 0) {
                parsedS.push(`未知S级${pool._type}`);
            }

            pool._s = parsedS.map(x => this.normalizeNameSync(x, aliasMap));
            pool._a = parsedA.map(x => this.normalizeNameSync(x, aliasMap));

            const parts = pool.timer.split('~');
            pool._endTimeStamp = parts.length >= 2 ? new Date(parts[1].trim()).getTime() || 0 : 0;
        });
        
        data.sort((a, b) => a._endTimeStamp - b._endTimeStamp);
        
        for (let i = 0; i < data.length; i++) {
            const p = data[i];
            if (p.timer.includes('版本更新后')) {
                let prevEnd = 0;
                for (let j = i - 1; j >= 0; j--) { if (data[j]._endTimeStamp > 0 && data[j]._endTimeStamp < p._endTimeStamp) { prevEnd = data[j]._endTimeStamp; break; } }
                if (prevEnd > 0) {
                    const d = new Date(prevEnd); d.setDate(d.getDate() + 1);
                    p.timer = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} 11:00:00 ~ ${p.timer.split('~')[1]}`;
                } else p.timer = `2024/07/04 10:00:00 ~ ${p.timer.split('~')[1]}`;
            }
            const startT = new Date(p.timer.split('~')[0].trim()).getTime();
            let matchedVer = null, minDiff = 12 * 24 * 60 * 60 * 1000;
            if (!isNaN(startT)) {
                for (const t of VERSION_TIMELINE) {
                    const diff = Math.abs(t.time - startT);
                    if (diff < minDiff) { minDiff = diff; matchedVer = t.v; }
                }
            }
            if (p.version && /\d+\.\d+/.test(p.version)) p._version = String(p.version).trim();
            else p._version = matchedVer || String(p.title || '').replace(/(独家|音擎|频段|「|」|期)/g, '').trim() || '未知版本';
        }
        return data;
    }
}
