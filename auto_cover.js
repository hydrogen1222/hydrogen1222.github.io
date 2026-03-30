/**
 * 自动为文章添加封面 - 改进版
 * 支持不同换行符和格式
 */

const fs = require('fs');
const path = require('path');

// 配置
const CONFIG = {
  postsDir: './source/_posts',
  defaultCover: 'https://s2.loli.net/2026/02/09/Dn8KqW2prvXtMYg.png',
  dryRun: false,  // true=仅预览, false=实际执行
};

// 解析 Front-matter（更宽容的版本）
function parseFrontMatter(content) {
  // 移除可能的 BOM
  content = content.replace(/^\uFEFF/, '');
  
  // 统一换行符为 \n
  content = content.replace(/\r\n/g, '\n');
  
  // 匹配 Front-matter（允许开头有空白）
  const match = content.match(/^[\s]*---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!match) return null;
  
  return {
    frontMatter: match[1],
    body: match[2],
    raw: content
  };
}

// 提取第一张图片路径
function extractFirstImage(content) {
  const imgMatch = content.match(/!\[.*?\]\((.*?\.(?:png|jpg|jpeg|gif|webp|svg))\)/i);
  return imgMatch ? imgMatch[1] : null;
}

// 更新或添加 Front-matter 中的 cover 字段
function updateCoverInFrontMatter(frontMatter, coverValue) {
  const lines = frontMatter.split('\n');
  let coverFound = false;
  
  const updatedLines = lines.map(line => {
    if (line.trim().startsWith('cover:')) {
      coverFound = true;
      return `cover: ${coverValue}`;
    }
    return line;
  });
  
  if (!coverFound) {
    updatedLines.push(`cover: ${coverValue}`);
  }
  
  return updatedLines.join('\n');
}

// 处理单个文件
function processFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const parsed = parseFrontMatter(content);
  
  if (!parsed) {
    console.log(`⚠️  跳过（无 Front-matter）: ${path.basename(filePath)}`);
    // 显示文件前50个字符，帮助调试
    console.log(`   文件开头: ${content.substring(0, 50).replace(/\n/g, '\\n')}`);
    return;
  }
  
  const fileName = path.basename(filePath, '.md');
  const fileDir = path.dirname(filePath);
  const assetDir = path.join(fileDir, fileName);
  
  // 提取第一张图片
  const firstImage = extractFirstImage(parsed.body);
  
  let coverValue = null;
  
  if (firstImage && !firstImage.startsWith('http')) {
    // 解析图片路径（可能是相对路径或 URL 编码的）
    let imagePath = firstImage;
    
    // 如果路径包含文件夹名，尝试去掉（因为图片可能在同名文件夹里）
    if (imagePath.includes('/')) {
      imagePath = imagePath.split('/').pop(); // 只取文件名
    }
    
    // 尝试多个可能的路径
    const possiblePaths = [
      path.join(fileDir, firstImage),           // 原始相对路径
      path.join(assetDir, imagePath),           // 同名文件夹里
      path.join(fileDir, decodeURIComponent(firstImage)), // URL 解码
    ];
    
    let sourceImagePath = null;
    for (let p of possiblePaths) {
      if (fs.existsSync(p)) {
        sourceImagePath = p;
        break;
      }
    }
    
    if (sourceImagePath) {
      // 确保资源文件夹存在
      if (!fs.existsSync(assetDir)) {
        if (!CONFIG.dryRun) {
          fs.mkdirSync(assetDir, { recursive: true });
        }
      }
      
      // 复制为 cover
      const imageExt = path.extname(sourceImagePath);
      const coverFilePath = path.join(assetDir, `cover${imageExt}`);
      
      if (!CONFIG.dryRun) {
        fs.copyFileSync(sourceImagePath, coverFilePath);
      }
      
      coverValue = `cover${imageExt}`;
      console.log(`✓ 复制封面: ${path.basename(filePath)}`);
      console.log(`  ${firstImage} → ${coverValue}`);
    } else {
      console.log(`⚠️  图片不存在: ${firstImage}`);
      console.log(`   尝试过的路径:`);
      possiblePaths.forEach(p => console.log(`   - ${p}`));
    }
  }
  
  // 如果没有找到图片，使用默认封面
  if (!coverValue) {
    coverValue = CONFIG.defaultCover;
    console.log(`✓ 使用默认封面: ${path.basename(filePath)}`);
  }
  
  // 更新 Front-matter（保持原有换行符）
  const newFrontMatter = updateCoverInFrontMatter(parsed.frontMatter, coverValue);
  const newContent = `---\n${newFrontMatter}\n---\n${parsed.body}`;
  
  if (!CONFIG.dryRun) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
  }
}

// 递归遍历目录
function processDirectory(dir) {
  const items = fs.readdirSync(dir);
  
  items.forEach(item => {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (item.endsWith('.md')) {
      processFile(fullPath);
    }
  });
}

// 主程序
console.log('========================================');
console.log('自动添加封面脚本');
console.log(`模式: ${CONFIG.dryRun ? '预览模式（不会实际修改文件）' : '执行模式'}`);
console.log('========================================\n');

processDirectory(CONFIG.postsDir);

console.log('\n========================================');
console.log('完成！');
if (CONFIG.dryRun) {
  console.log('这是预览模式，文件未被修改。');
  console.log('如需实际执行，请将脚本中 dryRun 改为 false');
}
console.log('========================================');