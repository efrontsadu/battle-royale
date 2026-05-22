(function(g) {

  g.WIDTH = 800;
  g.HEIGHT = 600;

  var game = g.game = new Phaser.Game(g.WIDTH, g.HEIGHT, Phaser.AUTO, 'screen');

  g.socket = io.connect();
  g.socket.io.reconnection(false);
  bindSocketEvents();

  g.sid = '';
  g.playerName = '';
  g.localPlayer = null;
  g.isLeader = false;
  g.mapId = 'lobby';
  g.mapData = {};
  g.map = null;
  g.remotePlayers = [];
  g.toAdd = [];
  g.toRemove = [];
  g.initialized = false;
  g.gameStarted = false;
  g.latency = 0;

  // Mobile controls state
  g.mobileControls = {
    joystickActive: false,
    joystickX: 0,
    joystickY: 0,
    attackPressed: false,
    blockPressed: false,
    touchId: null
  };

  Object.defineProperties(g, {
    connected: {
      get: function() { return this.remotePlayers.length + 1; },
      enumerable: true
    }
  });


  function bindSocketEvents() {

    g.socket.on('connected', onSocketConnected);
    g.socket.on('getMap', onGetMap);
    g.socket.on('newPlayer', onNewPlayer);
    g.socket.on('updatePlayers', onUpdatePlayers);
    g.socket.on('removePlayer', onRemovePlayer);
    g.socket.on('startGameCountdown', onStartGameCountdown);
    g.socket.on('resetGame', onResetGame);
    g.socket.on('announceWinner', onAnnounceWinner);
  }


  function onSocketConnected(data) {
    g.sid = data.id;

    // Set player name
    g.playerName = prompt("Please enter your name.") || 'Player';
    g.socket.emit('setPlayerName', { name: g.playerName });
    g.socket.emit('getMap', { mapId: g.mapId });
  }


  function onGetMap(data) {
    if (data.map) {
      g.mapData[data.mapId] = data.map;
      if (!g.initialized) {
        game.state.add('default', { preload: preload, create: create, update: update, render: render });
        game.state.start('default');
      }
      else {
        game.cache.addTilemap('map:' + data.mapId, null, arrayToCSV(data.map), Phaser.Tilemap.CSV);
      }
    }
  }


  function onNewPlayer(data) {
    g.toAdd.push(data);
  }


  function onUpdatePlayers(data) {
    var playersData = data.players;

    // Leader of the map
    g.isLeader = playersData[0].id === g.sid;

    for (var i = 0; i < playersData.length; i++) {
      var playerData = playersData[i];
      var player;

      if (playerData.id === g.sid) {
        player = g.localPlayer;
      }
      else {
        player = playerById(playerData.id);
      }

      if (!player) {
        console.log("Player not found: " + playerData.id);
        continue;
      }

      player.name = playerData.name;
      player.x = cpc(playerData.x);
      player.y = cpc(playerData.y);
      player.rotation = playerData.rotation;
      player.getAt(1).visible = playerData.attacking;
      player.getAt(2).visible = playerData.blocking;
      player.health = playerData.health;
      player.alive = playerData.health > 0;

      var text = player.name + '\n';
      for (var j = 0; j < player.health / 20; j++) {
        text += '\u2588'; // Block element
      }
      player.getAt(3).text = text;
      player.getAt(3).rotation = -playerData.rotation;
      player.getAt(3).x = 54 * Math.cos(playerData.rotation + Math.PI / 2);
      player.getAt(3).y = -54 * Math.sin(playerData.rotation + Math.PI / 2);

      if (!player.alive) {
        player.getAt(0).animations.play('dead');
      }
      else if (playerData.attacking) {
        player.getAt(0).animations.play('attack');
      }
      else if (playerData.blocking) {
        player.getAt(0).animations.play('block');
      }
      else if (playerData.moving) {
        player.getAt(0).animations.play('walk');
      }
      else {
        player.getAt(0).animations.stop();
        player.getAt(0).animations.frame = 0;
      }
    }
  }


  function onRemovePlayer(data) {
    var player = playerById(data.id);

    if (!player) {
      console.log("Player not found: " + playerData.id);
      return;
    }

    g.remotePlayers.splice(g.remotePlayers.indexOf(player), 1);
    g.toRemove.push(player);
  }


  function onStartGameCountdown(text) {
    if (!g.initialized) {
      return;
    }

    var middleText = g.hud.getAt(g.hud.middleText);
    middleText.text = text;
    game.tweens.create(middleText).to({ alpha: 0 }, 1000, null, true).onComplete.addOnce(function() {
      this.text = '';
      this.alpha = 1;
    }, middleText);

    if (text === "Start!") {
      g.gameStarted = true;
    }
  }


  function onResetGame() {
    g.gameStarted = false;
    g.hud.getAt(g.hud.middleText).text = '';
  }


  function onAnnounceWinner(data) {
    if (data.id === g.sid) {
      g.hud.getAt(g.hud.middleText).text = "You are the winner!";
    }
    else {
      var player = playerById(data.id);
      if (!player) {
        console.log("Player not found: " + playerData.id);
        return;
      }

      g.hud.getAt(g.hud.middleText).text = "The winner is:\n" + player.name;
    }
  }


  function preload() {

    g.socket.emit('newPlayer', { mapId: g.mapId });

    game.load.tilemap('map:' + g.mapId, null, arrayToCSV(g.mapData[g.mapId]), Phaser.Tilemap.CSV);

  //  game.load.image('player', 'assets/player.png');
    game.load.spritesheet('player', 'assets/player.png', 64, 64);
    game.load.image('attack', 'assets/attack.png');
    game.load.image('block', 'assets/block.png');
    game.load.image('wall', 'assets/wall.png');
    game.load.image('ground', 'assets/ground.png');
    game.load.image('start', 'assets/startbutton.png');
  }


  function create() {

    g.map = game.add.tilemap('map:' + g.mapId, 64, 64);
    g.map.addTilesetImage('ground', 'ground', 64, 64, 0, 0, 0);
    g.map.addTilesetImage('wall', 'wall', 64, 64, 0, 0, 1);

    g.map.createLayer(0).resizeWorld();

    g.localPlayer = addPlayer(0, 0, g.sid);

    game.camera.follow(g.localPlayer);

    // HUD
    g.hud = game.add.group();
    g.hud.fixedToCamera = true;
    g.hud.classType = Phaser.Text;
    var statusText = g.hud.create(g.WIDTH - 100, 10, "Connected: " + g.connected + "\nLatency: " + g.latency);
    g.hud.statusText = 0;
    statusText.fontSize = 16;
    statusText.align = 'right';

    g.hud.create(20, 15, "Health: " + g.localPlayer.health);
    g.hud.healthText = 1;

    var middleText = g.hud.create(g.WIDTH / 2, g.HEIGHT / 2);
    g.hud.middleText = 2;
    middleText.anchor.setTo(0.5, 0.5);
    middleText.fontSize = 54;
    middleText.align = 'center';

    // Buttons
    $('#startButton').click(function onClick() {
      g.socket.emit('startGame', { mapId: g.mapId });
    });

    $('#resetButton').click(function onClick() {
      g.socket.emit('resetGame', { mapId: g.mapId });
    });

    // Initialize mobile controls
    initMobileControls();

    g.initialized = true;
  }


  function update() {
    // Get keyboard input
    var keys = {
      left: game.input.keyboard.isDown(Phaser.Keyboard.LEFT),
      up: game.input.keyboard.isDown(Phaser.Keyboard.UP),
      right: game.input.keyboard.isDown(Phaser.Keyboard.RIGHT),
      down: game.input.keyboard.isDown(Phaser.Keyboard.DOWN),
      a: game.input.keyboard.isDown(Phaser.Keyboard.A),
      s: game.input.keyboard.isDown(Phaser.Keyboard.S),
      d: game.input.keyboard.isDown(Phaser.Keyboard.D)
    };

    // Add mobile joystick input
    if (g.mobileControls.joystickActive) {
      var magnitude = Math.sqrt(g.mobileControls.joystickX * g.mobileControls.joystickX + g.mobileControls.joystickY * g.mobileControls.joystickY);
      var threshold = 0.2;
      
      if (magnitude > threshold) {
        var angle = Math.atan2(g.mobileControls.joystickY, g.mobileControls.joystickX);
        
        // Map angle to directional keys
        // Right: -45 to 45 degrees
        keys.right = angle > -Math.PI / 4 && angle < Math.PI / 4;
        // Up: 45 to 135 degrees
        keys.up = angle > Math.PI / 4 && angle < 3 * Math.PI / 4;
        // Left: 135 to 225 degrees (or -135 to -45 degrees)
        keys.left = angle > 3 * Math.PI / 4 || angle < -3 * Math.PI / 4;
        // Down: -135 to -45 degrees
        keys.down = angle > -3 * Math.PI / 4 && angle < -Math.PI / 4;
      }
    }

    // Add mobile action button input
    keys.s = keys.s || g.mobileControls.attackPressed;
    keys.d = keys.d || g.mobileControls.blockPressed;

    g.socket.emit('updatePlayer', keys);

    while (g.toAdd.length !== 0) {
      var data = g.toAdd.shift();
      var toAdd = addPlayer(cpc(data.x), cpc(data.y), data.id);
      g.remotePlayers.push(toAdd);
    }

    while (g.toRemove.length !== 0) {
      var toRemove = g.toRemove.shift();
      game.world.removeChild(toRemove, true);
    }

    // Update HUD
    g.hud.getAt(g.hud.statusText).text = "Connected: " + g.connected + "\nLatency: " + ~~(g.latency);
    g.hud.getAt(g.hud.healthText).text = "Health: " + ~~(g.localPlayer.health);

    if (g.isLeader && !g.gameStarted) {
      if ($('#startButton').prop('disabled')) {
        $('#startButton').prop('disabled', false);
      }
    }
    else if (!$('#startButton').prop('disabled')) {
      $('#startButton').prop('disabled', true);
    }

    if (g.isLeader && g.gameStarted) {
      if ($('#resetButton').prop('disabled')) {
        $('#resetButton').prop('disabled', false);
      }
    }
    else if (!$('#resetButton').prop('disabled')) {
      $('#resetButton').prop('disabled', true);
    }
  }


  function render() {
  }


  function addPlayer(x, y, id) {
    var player = game.add.group();
    player.name = 'Player';
    player.id = id;
    player.x = x;
    player.y = y;
    player.create(-32, -32, 'player');
    player.create(-32, -64, 'attack');
    player.create(-32, -64, 'block');
    player.getAt(1).visible = false;
    player.getAt(2).visible = false;

    var text = new Phaser.Text(game, 0, -54, player.name);
    player.add(text);
    text.align = 'center';
    text.fontSize = 16;
    text.anchor.setTo(0.5, 0.5);
    text.alpha = 0.6;

    if (id === g.sid) {
      text.fill = 'red';
    }

    player.getAt(0).animations.add('attack', [3], 0, true);
    player.getAt(0).animations.add('block', [4], 0, true);
    player.getAt(0).animations.add('dead', [5], 0, true);
    player.getAt(0).animations.add('walk', [0, 1, 0, 2], 10, true);
    return player;
  }


  /**
   * meter to px, player coordinates
   * "convert player coordinate"
   */
  function cpc(x) {
    return x * 64 + 32;
  }


  function playerById(id) {
    for (var i = 0; i < g.remotePlayers.length; i++) {
      if (g.remotePlayers[i].id === id) {
        return g.remotePlayers[i];
      }
    }
    return false;
  }


  function arrayToCSV(array2d) {
    return array2d.map(function(row) {
      return row.join(',');
    }).join('\n');
  }


  /**
   * Initialize mobile controls (touch joystick and action buttons)
   */
  function initMobileControls() {
    var isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (!isMobile) {
      return; // Don't add mobile controls on desktop
    }

    // Create mobile controls HTML
    var controlsHTML = '<div id="mobileControls" style="position: fixed; bottom: 0; left: 0; width: 100%; height: 150px; display: flex; justify-content: space-between; padding: 10px; box-sizing: border-box;">' +
      '<div id="joystickContainer" style="position: relative; width: 120px; height: 120px; background: rgba(0, 0, 0, 0.3); border: 2px solid #fff; border-radius: 50%; pointer-events: auto;">' +
      '<div id="joystickKnob" style="position: absolute; width: 50px; height: 50px; background: rgba(255, 255, 255, 0.6); border-radius: 50%; top: 35px; left: 35px;"></div>' +
      '</div>' +
      '<div style="display: flex; flex-direction: column; gap: 10px; pointer-events: auto;">' +
      '<button id="mobileAttackBtn" style="width: 80px; height: 50px; background: rgba(255, 0, 0, 0.7); color: white; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">Attack</button>' +
      '<button id="mobileBlockBtn" style="width: 80px; height: 50px; background: rgba(0, 0, 255, 0.7); color: white; border: none; border-radius: 5px; font-weight: bold; cursor: pointer;">Block</button>' +
      '</div>' +
      '</div>';

    document.body.insertAdjacentHTML('beforeend', controlsHTML);

    var joystickContainer = document.getElementById('joystickContainer');
    var joystickKnob = document.getElementById('joystickKnob');
    var attackBtn = document.getElementById('mobileAttackBtn');
    var blockBtn = document.getElementById('mobileBlockBtn');

    var joystickCenterX = joystickContainer.offsetLeft + joystickContainer.offsetWidth / 2;
    var joystickCenterY = joystickContainer.offsetTop + joystickContainer.offsetHeight / 2;
    var joystickRadius = joystickContainer.offsetWidth / 2 - 25;

    // Joystick touch handling
    joystickContainer.addEventListener('touchstart', function(e) {
      g.mobileControls.joystickActive = true;
      g.mobileControls.touchId = e.touches[0].identifier;
      updateJoystick(e.touches[0]);
    });

    document.addEventListener('touchmove', function(e) {
      if (g.mobileControls.joystickActive && g.mobileControls.touchId !== null) {
        for (var i = 0; i < e.touches.length; i++) {
          if (e.touches[i].identifier === g.mobileControls.touchId) {
            updateJoystick(e.touches[i]);
            e.preventDefault();
            break;
          }
        }
      }
    });

    document.addEventListener('touchend', function(e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === g.mobileControls.touchId) {
          g.mobileControls.joystickActive = false;
          g.mobileControls.touchId = null;
          g.mobileControls.joystickX = 0;
          g.mobileControls.joystickY = 0;
          joystickKnob.style.transform = 'translate(0, 0)';
          break;
        }
      }
    });

    function updateJoystick(touch) {
      var touchX = touch.clientX;
      var touchY = touch.clientY;

      var deltaX = touchX - joystickCenterX;
      var deltaY = touchY - joystickCenterY;
      var distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

      if (distance > joystickRadius) {
        var angle = Math.atan2(deltaY, deltaX);
        deltaX = Math.cos(angle) * joystickRadius;
        deltaY = Math.sin(angle) * joystickRadius;
      }

      g.mobileControls.joystickX = deltaX / joystickRadius;
      g.mobileControls.joystickY = deltaY / joystickRadius;

      joystickKnob.style.transform = 'translate(' + deltaX + 'px, ' + deltaY + 'px)';
    }

    // Attack button handling
    attackBtn.addEventListener('touchstart', function(e) {
      g.mobileControls.attackPressed = true;
      attackBtn.style.background = 'rgba(255, 0, 0, 1)';
      e.preventDefault();
    });

    attackBtn.addEventListener('touchend', function(e) {
      g.mobileControls.attackPressed = false;
      attackBtn.style.background = 'rgba(255, 0, 0, 0.7)';
      e.preventDefault();
    });

    // Block button handling
    blockBtn.addEventListener('touchstart', function(e) {
      g.mobileControls.blockPressed = true;
      blockBtn.style.background = 'rgba(0, 0, 255, 1)';
      e.preventDefault();
    });

    blockBtn.addEventListener('touchend', function(e) {
      g.mobileControls.blockPressed = false;
      blockBtn.style.background = 'rgba(0, 0, 255, 0.7)';
      e.preventDefault();
    });
  }

})(window.g = window.g || {});
