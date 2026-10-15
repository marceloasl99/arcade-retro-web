// Teste automatizado do motor Bomberman Retrô (bomberman.js)
const fs = require('fs');
const path = require('path');

let fail = 0;
function ok(cond, msg) {
  if (cond) console.log('  ok  - ' + msg);
  else { console.log('  FAIL- ' + msg); fail++; }
}

console.log('[1] Carregamento do módulo Bomberman');
const Bomberman = require('./bomberman.js');
ok(typeof Bomberman === 'object', 'módulo Bomberman exportado');
ok(Bomberman.COLS === 15 && Bomberman.ROWS === 13, 'dimensões clássicas do grid 15x13');
ok(typeof Bomberman.BombermanGame === 'function', 'classe BombermanGame disponível');

console.log('\n[2] Inicialização da arena e grid');
const game = new Bomberman.BombermanGame(null, {});
game.startNewGame();

ok(game.grid.length === 13, 'grid possui 13 linhas');
ok(game.grid[0].length === 15, 'grid possui 15 colunas');

// Bordas devem ser sólidas
let bordersSolid = true;
for (let c = 0; c < 15; c++) {
  if (game.grid[0][c] !== Bomberman.TILE_WALL || game.grid[12][c] !== Bomberman.TILE_WALL) bordersSolid = false;
}
for (let r = 0; r < 13; r++) {
  if (game.grid[r][0] !== Bomberman.TILE_WALL || game.grid[r][14] !== Bomberman.TILE_WALL) bordersSolid = false;
}
ok(bordersSolid, 'todas as bordas externas são paredes sólidas indestrutíveis');

// Pilares internos pares devem ser sólidos
let pillarsSolid = true;
for (let r = 2; r < 12; r += 2) {
  for (let c = 2; c < 14; c += 2) {
    if (game.grid[r][c] !== Bomberman.TILE_WALL) pillarsSolid = false;
  }
}
ok(pillarsSolid, 'pilares internos nas posições pares são sólidos estilo SNES');

// Zona de spawn segura do jogador (1,1), (1,2), (2,1)
ok(game.grid[1][1] === Bomberman.TILE_EMPTY, 'célula de spawn (1,1) está livre');
ok(game.grid[1][2] === Bomberman.TILE_EMPTY, 'célula adjacente (1,2) está livre');
ok(game.grid[2][1] === Bomberman.TILE_EMPTY, 'célula adjacente (2,1) está livre');

console.log('\n[3] Movimentação do Jogador');
ok(game.player.x === 1.0 && game.player.y === 1.0, 'jogador inicia em (1, 1)');
const initX = game.player.x;
game.movePlayer(1, 0); // Tenta mover para a direita
ok(game.player.x > initX, 'jogador se desloca para a direita em espaço vazio');

// Tenta mover contra a parede esquerda até encostar
for (let i = 0; i < 20; i++) game.movePlayer(-1, 0);
ok(game.player.x >= 0.85 - 0.001 && game.player.x < 0.9, 'jogador colide e não atravessa parede esquerda (parou em ' + game.player.x.toFixed(2) + ')');

console.log('\n[4] Bombas e Detonação');
game.player.x = 1.0;
game.player.y = 1.0;
game.dropBomb();
ok(game.bombs.length === 1, 'bomba plantada com sucesso no tile do jogador');
ok(game.bombs[0].x === 1 && game.bombs[0].y === 1, 'coordenadas da bomba batem com tile');

// Não pode plantar mais que o limite inicial (1)
game.dropBomb();
ok(game.bombs.length === 1, 'respeita limite máximo de bombas simultâneas');

// Força detonação
game.detonateBomb(0);
ok(game.bombs.length === 0, 'bomba consumida após detonação');
ok(game.explosions.length > 0, 'fogo propagado em formato de cruz');
ok(game.explosions.some(e => e.x === 1 && e.y === 1 && e.type === 'center'), 'chama central criada');

console.log('\n[5] Destruição de blocos e revelação de itens');
// Cria manualmente um bloco quebrável em (3, 1)
game.grid[1][3] = Bomberman.TILE_BLOCK;
game.bombs.push({ x: 2, y: 1, range: 2, timer: 1, owner: 'player', pulse: 0 });
game.detonateBomb(0);
ok(game.grid[1][3] === Bomberman.TILE_EMPTY, 'bloco destrutível é destruído pelo fogo da bomba');

console.log('\n[6] Coleta de Power-ups');
game.player.x = 5.0;
game.player.y = 5.0;
game.grid[5][5] = Bomberman.TILE_EMPTY;
const initialMaxBombs = game.player.maxBombs;
game.collectPowerup({ x: 5, y: 5, type: Bomberman.POWERUP_BOMB });
ok(game.player.maxBombs === initialMaxBombs + 1, 'powerup de bomba aumenta maxBombs (+1)');

const initialFireRange = game.player.fireRange;
game.collectPowerup({ x: 5, y: 5, type: Bomberman.POWERUP_FIRE });
ok(game.player.fireRange === initialFireRange + 1, 'powerup de fogo aumenta fireRange (+1)');

game.collectPowerup({ x: 5, y: 5, type: Bomberman.POWERUP_HEART });
ok(game.player.hasHeart === true, 'powerup de coração concede escudo protetor');

console.log('\n[7] Inimigos e Dano');
ok(game.enemies.length > 0, 'inimigos gerados na arena (' + game.enemies.length + ')');
const initialLives = game.lives;
game.player.invulnerable = 0;
game.hitPlayer(); // Coração absorve dano
ok(game.lives === initialLives && game.player.hasHeart === false, 'coração absorve 1 dano sem perder vida');

game.player.invulnerable = 0;
game.hitPlayer(); // Agora toma dano real
ok(game.player.isDying === true, 'jogador entra em estado de morte sem escudo');

console.log('\n=========================================');
console.log(fail === 0 ? 'TODOS OS TESTES DO BOMBERMAN PASSARAM' : fail + ' TESTE(S) FALHARAM');
process.exit(fail === 0 ? 0 : 1);
