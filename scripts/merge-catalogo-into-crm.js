const fs = require('fs');
const path = require('path');

// Paths
const CRM_FILE = path.resolve(__dirname, '../crm.html');
const SUP_FILE = path.resolve(__dirname, '../../Catalogos/Projeto-Catalogos/catalogo-tecnico/dados/linha-suplementos.json');
const COS_FILE = path.resolve(__dirname, '../../Catalogos/Projeto-Catalogos/catalogo-tecnico/dados/linha-cosmeticos.json');
const MEL_FILE = path.resolve(__dirname, '../../Catalogos/Projeto-Catalogos/catalogo-tecnico/dados/linha-mel.json');
const VIS_FILE = path.resolve(__dirname, '../../Catalogos/Projeto-Catalogos/catalogo/produtos.json');
const IMG_SRC = path.resolve(__dirname, '../../Catalogos/Projeto-Catalogos/catalogo/img');
const IMG_DST = path.resolve(__dirname, '../img');

// Read all sources
const suplementos = JSON.parse(fs.readFileSync(SUP_FILE, 'utf-8')).produtos;
const cosmeticos = JSON.parse(fs.readFileSync(COS_FILE, 'utf-8')).produtos;
const mel = JSON.parse(fs.readFileSync(MEL_FILE, 'utf-8')).produtos;
const visual = JSON.parse(fs.readFileSync(VIS_FILE, 'utf-8')).products;

// Build lookup by code for technical catalog (codigo)
const tecLookup = {};
for (const p of [...suplementos, ...cosmeticos, ...mel]) {
  tecLookup[p.codigo] = p;
}

// Build lookup for visual catalog (code)
const visLookup = {};
for (const p of visual) {
  if (p.code) visLookup[p.code] = p;
}

// Read current CRM to extract PRODUCTS_SEED
const crmHtml = fs.readFileSync(CRM_FILE, 'utf-8');

// Extract PRODUCTS_SEED (JS object notation, not JSON)
const seedMatch = crmHtml.match(/const PRODUCTS_SEED\s*=\s*(\[[\s\S]*?\]);/);
if (!seedMatch) {
  console.error('PRODUCTS_SEED not found in crm.html');
  process.exit(1);
}

// Parse JS object notation using Function constructor
let products;
try {
  products = new Function(`return ${seedMatch[1]}`)();
} catch(e) {
  console.error('Failed to parse PRODUCTS_SEED:', e.message);
  process.exit(1);
}
console.log(`Found ${products.length} products in CRM seed`);

// Enrich each product
let enrichedCount = 0;
let imageCount = 0;

for (const p of products) {
  const code = p.id;
  const tec = tecLookup[code];
  const vis = visLookup[code];

  if (tec) {
    // Description from commercial.chamada or descricao
    if (tec.comercial) {
      const desc = tec.comercial.descricao || tec.comercial.chamada || '';
      if (desc) {
        p.description = desc;
      }
    }

    // EAN
    if (tec.ean) {
      p.ean = tec.ean;
    }

    // Ingredients
    if (tec.ingredientes) {
      p.ingredients = tec.ingredientes;
    }

    // Usage instructions
    if (tec.modo_uso) {
      p.usage = tec.modo_uso;
    }

    // Warnings
    if (tec.advertencias && tec.advertencias.length > 0) {
      p.warnings = tec.advertencias;
    }

    // Registration info
    if (tec.registro) {
      p.registration = tec.registro;
    }

    // Apresentacao
    if (tec.apresentacao) {
      p.presentation = tec.apresentacao;
    }

    // Peso
    if (tec.peso_liquido) {
      p.weight = tec.peso_liquido;
    }

    enrichedCount++;
  }

  // Add image from visual catalog
  if (vis && vis.photo) {
    const imgFile = vis.photo;
    const srcPath = path.join(IMG_SRC, imgFile);
    if (fs.existsSync(srcPath)) {
      if (!p.images) p.images = [];
      // Check if not already set
      if (p.images.length === 0) {
        p.images.push(`img/${imgFile}`);
        imageCount++;
      }
    }
  }
}

console.log(`Enriched ${enrichedCount} products with catalog data`);
console.log(`Added ${imageCount} product images`);

// Ensure img directory exists
if (!fs.existsSync(IMG_DST)) {
  fs.mkdirSync(IMG_DST, { recursive: true });
}

// Copy images
let copied = 0;
for (const p of products) {
  if (p.images && p.images.length > 0) {
    const imgPath = p.images[0]; // e.g., "img/75.jpg"
    const imgName = path.basename(imgPath);
    const src = path.join(IMG_SRC, imgName);
    const dst = path.join(IMG_DST, imgName);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.copyFileSync(src, dst);
      copied++;
    }
  }
}
console.log(`Copied ${copied} new images to CRM img/`);

// Generate the new PRODUCTS_SEED string (JS object notation)
const newSeed = products.map(p => {
  const fields = [];
  fields.push(`id:'${p.id}'`);
  fields.push(`name:'${(p.name||'').replace(/'/g, "\\'")}'`);
  fields.push(`description:'${(p.description||'').replace(/'/g, "\\'")}'`);
  fields.push(`characteristics:${JSON.stringify(p.characteristics||[])}`);
  fields.push(`price:${p.price}`);
  fields.push(`images:${JSON.stringify(p.images||[])}`);
  fields.push(`category:'${(p.category||'').replace(/'/g, "\\'")}'`);
  fields.push(`status:'${p.status||'ativo'}'`);
  if (p.ean) fields.push(`ean:'${p.ean}'`);
  if (p.ingredients) fields.push(`ingredients:'${(p.ingredients||'').replace(/'/g, "\\'")}'`);
  if (p.usage) fields.push(`usage:'${(p.usage||'').replace(/'/g, "\\'")}'`);
  if (p.warnings) fields.push(`warnings:${JSON.stringify(p.warnings)}`);
  if (p.presentation) fields.push(`presentation:'${(p.presentation||'').replace(/'/g, "\\'")}'`);
  return `  {${fields.join(',')}}`;
}).join(',\n');

const newSeedBlock = `const PRODUCTS_SEED = [\n${newSeed}\n];`;

// Replace in crm.html
const updated = crmHtml.replace(
  /const PRODUCTS_SEED\s*=\s*\[[\s\S]*?\];/,
  newSeedBlock
);

fs.writeFileSync(CRM_FILE, updated, 'utf-8');
console.log('Done! PRODUCTS_SEED updated in crm.html with enriched product data');
