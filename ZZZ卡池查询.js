//作者devil
import fetch from 'node-fetch'
import fs from 'fs'
import path from 'path'

const BWIKI_URL = 'https://wiki.biligame.com/zzz/%E8%B0%83%E9%A2%91';

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

export class CardPoolQuery extends plugin {
    constructor() {
        super({
            name: "卡池查询",
            dsc: "查询绝区零全角色/武器卡池记录",
            event: "message",
            priority: -114514,
            rule: [
                // ^(#绝区零|%|绝区零) 限制了只响应这三种前缀
                { reg: '^(#绝区零|%|绝区零).*复刻统计$', fnc: 'dispatchHandler' },
                { reg: '^(#绝区零|%|绝区零)v?(\\d+\\.\\d+)(上半|下半|上下半)?卡池$', fnc: 'dispatchVersionHandler' },
                { reg: '^(#绝区零|%|绝区零)(当前|本期|当期)卡池$', fnc: 'queryCurrentPool' }
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
            replyMsg += ` ${roles.map(p => `◈ ${p.title || '角色'}：\n   S-${p._s.join(', ')} | A-${p._a.length > 0 ? p._a.join(', ') : '无'}`).join('\n ')}\n`;
        }

        const weapons = activePools.filter(p => p._type === '武器');
        if (weapons.length > 0) {
            replyMsg += `\n【💿 音擎调频】\n`;
            replyMsg += ` ${weapons.map(p => `◈ ${p.title || '音擎'}：\n   S-${p._s.join(', ')} | A-${p._a.length > 0 ? p._a.join(', ') : '无'}`).join('\n ')}\n`;
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
                replyMsg += ` ${roles.map(p => `◈ ${p.title || '角色'}：\n   S-${p._s.join(', ')} | A-${p._a.length > 0 ? p._a.join(', ') : '无'}`).join('\n ')}\n`;
            }
            const weapons = stagePools.filter(p => p._type === '武器');
            if (weapons.length > 0) {
                replyMsg += ` ${weapons.map(p => `◈ ${p.title || '音擎'}：\n   S-${p._s.join(', ')} | A-${p._a.length > 0 ? p._a.join(', ') : '无'}`).join('\n ')}\n`;
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
        replyMsg += records.map((pool, i) => `[第${i + 1}次] v${pool._version} ${pool.title ? `| ${pool.title}` : ''}\n ⏰ ${pool.timer.replace(/ \d{2}:\d{2}:\d{2}/g, '').replace(' ~ ', '~')}`).join('\n\n');
        return e.reply(replyMsg);
    }

    parseTimer(timerStr) {
        if (!timerStr || typeof timerStr !== 'string') return { startTime: null, endTime: null };
        const parts = timerStr.split('~');
        if (parts.length < 2) return { startTime: null, endTime: null };
        let startTime = new Date(parts[0].trim()), endTime = new Date(parts[1].trim());
        return { startTime: isNaN(startTime.getTime()) ? null : startTime, endTime: isNaN(endTime.getTime()) ? null : endTime };
    }

    async fetchData(forceFetch = false) {
        const now = Date.now();
        let localBase = [];
        let lastModified = 0;
        const dataPath = path.join(process.cwd(), 'data', 'zzz_full_history.json');

        if (fs.existsSync(dataPath)) {
            try {
                localBase = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
                lastModified = fs.statSync(dataPath).mtimeMs;
            } catch (err) {
                logger.error(`[卡池查询] 读取本地底库失败: ${err.message}`);
            }
        }

        let needRemote = true;
        if (!forceFetch) {
            if (localBase.length > 0 && (now - lastModified < 2 * 60 * 60 * 1000)) {
                needRemote = false;
            }
        }

        // 本地护盾生效期间，将读取到的精简数据过一遍预处理
        if (!needRemote && localBase.length > 0) {
            const aliasMap = await this.getAliasMap();
            return this.preprocessData(localBase, aliasMap);
        }

        let allData = [];
        const localEndTimes = new Set();

        // 建立防覆盖护盾
        localBase.forEach(p => {
            const t = p._endTimeStamp || (p.timer ? new Date(p.timer.split('~')[1].trim()).getTime() : 0);
            const type = p._type || (String(p.type || '').includes('角色') ? '角色' : '武器');
            if (t) localEndTimes.add(`${type}_${t}`);
        });

        try {
            // 直接从 Bwiki 扒取官方最新页面，抛弃断更仓库
            const res = await fetch(BWIKI_URL, {
                timeout: 15000,
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
            });

            if (res.ok) {
                const html = await res.text();
                // 锁定包含卡池信息的 wikitable
                const tableRegex = /<table class="wikitable" style="text-align:center;">([\s\S]*?)<\/table>/gi;
                let match;

                while ((match = tableRegex.exec(html)) !== null) {
                    const tb = match[1];

                    // 1. 提取标题 (从 img alt 中提取)
                    const titleMatch = tb.match(/<img[^>]+alt="([^"]+)"/);
                    if (!titleMatch) continue;
                    const title = titleMatch[1].trim();

                    // 2. 提取时间
                    const timerMatch = tb.match(/<th[^>]*>\s*时间\s*<\/th>\s*<td>([\s\S]*?)<\/td>/);
                    if (!timerMatch) continue;
                    let timer = timerMatch[1].replace(/<[^>]+>/g, '').trim();
                    timer = timer.replace(/[-—]/g, '~');
                    if (!timer || !timer.includes('~')) continue;

                    // 3. 提取版本
                    const versionMatch = tb.match(/<th[^>]*>\s*版本\s*<\/th>\s*<td>([\s\S]*?)<\/td>/);
                    let version = versionMatch ? versionMatch[1].replace(/<[^>]+>/g, '').trim() : "未知版本";

                    // 4. 提取 S级 (精准提取 a 标签的 title 属性，天然去除了（击破·火）等冗余后缀)
                    const sMatch = tb.match(/<th[^>]*>\s*S级[^<]*<\/th>\s*<td>([\s\S]*?)<\/td>/);
                    let sRanks = [];
                    if (sMatch) {
                        const aRegex = /<a[^>]+title="([^"]+)"/g;
                        let aTag;
                        while ((aTag = aRegex.exec(sMatch[1])) !== null) {
                            sRanks.push(aTag[1].trim());
                        }
                    }

                    // 5. 提取 A级
                    const aMatch = tb.match(/<th[^>]*>\s*A级[^<]*<\/th>\s*<td>([\s\S]*?)<\/td>/);
                    let aRanks = [];
                    if (aMatch) {
                        const aRegex = /<a[^>]+title="([^"]+)"/g;
                        let aTag;
                        while ((aTag = aRegex.exec(aMatch[1])) !== null) {
                            aRanks.push(aTag[1].trim());
                        }
                    }

                    // 若数据残缺则跳过
                    if (sRanks.length === 0 || !timer) continue;

                    // 6. 识别类型并触发“增量护盾”
                    let pType = title.includes("独家") ? "角色" : "武器";
                    if (title.includes("音擎")) pType = "武器";

                    const endTimeStr = timer.split('~')[1].trim();
                    const t = new Date(endTimeStr).getTime();

                    // 核心：只补缺！只要本地 JSON 里没有这个结束时间，才把它推进待定数组
                    if (!isNaN(t) && !localEndTimes.has(`${pType}_${t}`)) {
                        allData.push({
                            title: title,
                            type: pType,
                            version: version,
                            timer: timer,
                            s: sRanks,
                            a: aRanks
                        });
                    }
                }
            } else {
                logger.error(`[卡池查询] Bwiki 拉取失败，状态码: ${res.status}`);
            }
        } catch (err) {
            logger.error(`[卡池查询] Bwiki 网络请求异常: ${err.message}`);
        }

        const aliasMap = await this.getAliasMap();

        allData.push(...localBase);
        allData = this.preprocessData(allData, aliasMap);

        const uniqueData = [], seen = new Set();
        for (const p of allData) {
            const key = `${p._type}_${p._endTimeStamp}_${p._s[0] || 'Unknown'}`;
            if (!seen.has(key)) { seen.add(key); uniqueData.push(p); }
        }

        // 自动迭代写入本地，清洗冗余字段，只保存最精简的 5 个核心数据
        try {
            const exportData = uniqueData.map(p => ({
                title: p.title || '',
                type: p._type,
                version: p._version,
                timer: p.timer,
                s: p._s,
                a: p._a
            }));
            const dataDir = path.join(process.cwd(), 'data');
            if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
            fs.writeFileSync(dataPath, JSON.stringify(exportData, null, 2), 'utf-8');
        } catch (err) { }

        return uniqueData;
    }

    preprocessData(data, aliasMap) {
        data.forEach(pool => {
            let timerStr = Array.isArray(pool.timer) ? pool.timer.join(' ~ ') : (pool.timer || (pool.start && pool.end ? `${pool.start} ~ ${pool.end}` : ""));
            pool.timer = timerStr;
            let rawType = String(pool.type || pool.pool_type || '').toLowerCase();
            pool._type = rawType.includes('角色') || rawType === 'character' ? '角色' : '武器';

            // 拥抱新结构：直接提取明确的 s 和 a 字段
            let sRaw = pool.s || pool.up5 || pool['5'] || pool._s || [];
            let aRaw = pool.a || pool.up4 || pool['4'] || pool._a || [];

            // 新格式中 s 变成了单字符串（如 "s": "南宫羽"），这里兼容转为数组
            let parsedS = (Array.isArray(sRaw) ? sRaw : [sRaw]).filter(Boolean).map(x => typeof x === 'object' ? x.title || x.name : String(x));
            let parsedA = (Array.isArray(aRaw) ? aRaw : [aRaw]).filter(Boolean).map(x => typeof x === 'object' ? x.title || x.name : String(x));

            if (parsedS.length === 0) parsedS.push(`未知S级${pool._type}`);

            pool._s = parsedS.map(x => this.normalizeNameSync(x.replace(/[「」【】]/g, '').trim(), aliasMap));
            pool._a = parsedA.map(x => this.normalizeNameSync(x.replace(/[「」【】]/g, '').trim(), aliasMap));

            const parts = pool.timer.split('~');
            pool._endTimeStamp = parts.length >= 2 ? new Date(parts[1].trim()).getTime() || 0 : 0;
        });

        data.sort((a, b) => a._endTimeStamp - b._endTimeStamp);

        // 同一版本可能有多个“版本更新后”开始、但结束时间不同的频段。
        // 先用该版本最早的结束时间定位上一版本，避免长线频段被误算到下半。
        const versionUpdateEnds = new Map();
        for (const p of data) {
            if (!p.timer.includes('版本更新后') || p._endTimeStamp <= 0) continue;
            const versionKey = String(p.version || '').match(/\d+\.\d+/)?.[0] || String(p.version || '').trim();
            const earliestEnd = versionUpdateEnds.get(versionKey);
            if (!earliestEnd || p._endTimeStamp < earliestEnd) versionUpdateEnds.set(versionKey, p._endTimeStamp);
        }

        const versionUpdateStarts = new Map();
        for (const [versionKey, earliestEnd] of versionUpdateEnds) {
            let prevEnd = 0;
            for (const p of data) {
                if (p._endTimeStamp > prevEnd && p._endTimeStamp < earliestEnd) prevEnd = p._endTimeStamp;
            }
            if (prevEnd > 0) {
                const d = new Date(prevEnd);
                d.setDate(d.getDate() + 1);
                versionUpdateStarts.set(versionKey, `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} 11:00:00`);
            }
        }

        for (let i = 0; i < data.length; i++) {
            const p = data[i];
            // 自动推算“x.x版本更新后”的具体日期
            if (p.timer.includes('版本更新后')) {
                const versionKey = String(p.version || '').match(/\d+\.\d+/)?.[0] || String(p.version || '').trim();
                const startTime = versionUpdateStarts.get(versionKey) || '2024/07/04 10:00:00';
                p.timer = `${startTime} ~ ${p.timer.split('~')[1]}`;
            }

            if (p.version && typeof p.version === 'string') {
                p._version = String(p.version).trim();
            } else {
                p._version = String(p.title || '').replace(/(独家|音擎|频段|「|」|期)/g, '').trim() || '未知版本';
            }
        }
        return data;
    }
}
