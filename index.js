var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io')(server);
var port = process.env.PORT || 3000;

server.listen(port, function () {
	console.log('Server listening at port %d', port);
});
app.use(express.static(__dirname + '/public'));

var WGDS = {
	MAX_PLAYERS_PER_GAME: 8,
	TIME_PER_TURN: 120,
	TIME_PER_ELECTION: 30,
	TIME_PER_ELECTION_AFTER_VOTE: 5,

	MAX_ACTIONS_PER_TURN: 4,
	MIN_ACTIONS_PER_TURN: 2,

	MAX_TURNS_PER_GAME: 16,
	MIN_TURNS_PER_GAME: 14,
	
	SHARES_PER_PLAYER: 5,
	
	PLAYER_COLORS: [ '#FF8080', '#FFFF56', '#8AC4FF', '#56FF56', '#FFC5E8',
	                 '#65FFFF', '#FFB163', '#8BE6A0', '#CECECE', '#DC9EFF' ],

	newGame : function(gameName) {
		for(var i=0; i<this.games.length; i++)
			if(this.games[i].name == gameName)
				return false;

		return {
			corporations : [
				{ name: 'Schweiz', ch: true, shares: 42, sharesAvailable: 42, investors: {}, president: null },

				{ name: 'Pestle',           shares: 35, sharesAvailable: 35, ch: false, investors: {}, president: null },
				{ name: 'Bank UBCS',        shares: 32, sharesAvailable: 32, ch: false, investors: {}, president: null },
				{ name: 'Dengros',          shares: 27, sharesAvailable: 27, ch: false, investors: {}, president: null },
				{ name: 'Moche',            shares: 26, sharesAvailable: 26, ch: false, investors: {}, president: null },
				{ name: 'Snatch Uhren',     shares: 24, sharesAvailable: 24, ch: false, investors: {}, president: null },
				{ name: 'ABC Industry',     shares: 21, sharesAvailable: 21, ch: false, investors: {}, president: null },
				{ name: 'Switch Life',      shares: 20, sharesAvailable: 20, ch: false, investors: {}, president: null },
				{ name: 'Ypsen-Biomed',     shares: 18, sharesAvailable: 18, ch: false, investors: {}, president: null },
				{ name: 'Faiblecom',        shares: 18, sharesAvailable: 18, ch: false, investors: {}, president: null },
				{ name: 'Fingier Presse',   shares: 16, sharesAvailable: 16, ch: false, investors: {}, president: null },
				{ name: 'Charles Fischele', shares: 14, sharesAvailable: 14, ch: false, investors: {}, president: null },
				{ name: 'GEMS-Chemie',      shares: 13, sharesAvailable: 13, ch: false, investors: {}, president: null },
				{ name: 'Panzer Trans',     shares: 11, sharesAvailable: 11, ch: false, investors: {}, president: null },
				{ name: 'Ökobank',          shares: 8,  sharesAvailable: 8,  ch: false, investors: {}, president: null },
				{ name: 'Fata Morgana',     shares: 5,  sharesAvailable: 5,  ch: false, investors: {}, president: null },
		 	],
			players: {},
			turn: 0, // 0 = pre-game
			time: -1,
			name: gameName,
			paused: false,
			winner: null,

			elections: {
				current: -1,
				schedule: [],
				voters: [],
				time: 0
			},
			
			update: function(what) {
				if(what) {
					if(!Array.isArray(what))
						what = [what];
					var obj = {};
					var game = this;
					what.forEach(function(item) {
						obj[item] = game[item];
					});
					this.emit('update',obj);
				} else {
					this.emit('update',this);
				}
			},
			emit: function(message,data) {
				io.to('game_'+this.name).emit('game '+message,data);
			},
			
			nextTurn: function() {
				this.emit('closeall');
				var game = this;
				this.elections.schedule = [];
				
				// check if the game ends ...
				if(this.turn >= WGDS.MIN_TURNS_PER_GAME) {
					var prob = (1+this.turn-WGDS.MIN_TURNS_PER_GAME) / 
					  (1+WGDS.MAX_TURNS_PER_GAME-WGDS.MIN_TURNS_PER_GAME);
					if(Math.random() <= prob) {
						this.turn = -5;
						this.time = 0;
						for(var player in this.players)
							this.players[player].actions = 0;
					}
				}
				
				this.turn++;
				io.to('_lobby').emit('lobby gamelist', WGDS.listGames());
				
				// check if this is a 'special' end-of-game schedule turn
				if(this.turn == -4) {
					this.emit('status','Spielende, Wahlen von Amtes wegen.');
					for(var i=this.corporations.length-1; i>=0; i--)
						if(!this.corporations[i].ch)
							this.scheduleElection(i);

					this.elections.current = 0;
					this.elections.time = WGDS.TIME_PER_ELECTION;
					this.tickElections(this);

					this.update();
					return;
				} else if(this.turn == -3) {
					/* var corps = [];
					for(var i=this.corporations.length-1; i>=0; i--)
						if(!this.corporations[i].ch)
							corps.push(i);
					while(corps.length > 0) {
						var idx = Math.floor(Math.random()*corps.length);
						this.scheduleElection(corps.splice(idx,1)[0]);
					} */
					for(var i=0; i<this.corporations.length; i++)
						if(!this.corporations[i].ch)
							this.scheduleElection(i);

					this.elections.current = 0;
					this.elections.time = WGDS.TIME_PER_ELECTION;
					this.tickElections(this);

					this.update();
					return;
				} else if(this.turn == -2) {
					for(var i=0; i<this.corporations.length; i++)
						if(this.corporations[i].ch)
							this.scheduleElection(i);

					this.elections.current = 0;
					this.elections.time = WGDS.TIME_PER_ELECTION;
					this.tickElections(this);

					this.update();
					return;
				} else if(this.turn == -1) {
					for(var i=0; i<this.corporations.length; i++)
						if(this.corporations[i].ch)
							this.winner = this.corporations[i].president;
					if(this.winner !== null)
						this.emit('status','Spielende. Der Sieger heisst '+this.winner+'!');
					else
						this.emit('status','Spielende. Das Spiel endet unentschieden.');

					this.emit('status','Danke fürs Spielen, euer node.js-Server.');

					this.update();
					return;
				}
				
				this.time = WGDS.TIME_PER_TURN;
				this.emit('status','Start der Runde '+this.turn+'.');
				for(var player in this.players) {
					if(this.turn == 1)
						this.players[player].actions = 1
					else if(this.turn == 2)
						this.players[player].actions = 2
					else
						this.players[player].actions = WGDS.MIN_ACTIONS_PER_TURN
							+ Math.floor(Math.random()*(1+WGDS.MAX_ACTIONS_PER_TURN-WGDS.MIN_ACTIONS_PER_TURN));
				}
				this.update();
				setTimeout(this.tickTurn,1000,this);
			},
			endTurn: function() {
				this.emit('status','Ende der Runde '+this.turn+'.');
				this.emit('closeall');
				for(var player in this.players)
					this.players[player].actions = 0;

				if(this.elections.schedule.length > 0) {
					this.elections.current = 0;
					this.elections.time = WGDS.TIME_PER_ELECTION;
					this.tickElections(this);
					this.update();
				} else {
					this.nextTurn();
				}
			},
			scheduleElection: function(corporation) {
				if(!this.corporations[corporation]) return;

				this.elections.schedule.push({
					'corporation': corporation,
					'result': null,
					votes: {}
				});
			},
			vote: function(player,president) {
				if(this.elections.current == -1) return;
				if(!this.elections.schedule[this.elections.current]) return;
				if(this.elections.voters.indexOf(player) != -1) return;
				this.elections.voters.push(player);
				var corp = this.corporations[this.elections.schedule[this.elections.current].corporation];
				for(var investor in corp.investors) {
					if(investor == player) {
						if(!this.elections.schedule[this.elections.current].votes[president])
							this.elections.schedule[this.elections.current].votes[president] = [];
						this.elections.schedule[this.elections.current].votes[president].push({
							amount: corp.investors[investor],
							source: investor
						});
					} else if(investor.match(/^corp_(\d+)$/)) {
						if(!this.elections.schedule[this.elections.current].votes[president])
							this.elections.schedule[this.elections.current].votes[president] = [];
						if(this.corporations[RegExp.$1].president == player) {
								this.elections.schedule[this.elections.current].votes[president].push({
									amount: corp.investors[investor],
									source: investor
								});
						}
					}
				}
			},
			tickElections: function(game) {
				if(!game.paused)
					game.elections.time--;
	
				if(game.elections.time <= 0) {
					// if someone didn't vote, vote for himself.
					for(var player in game.players)
						game.vote(player,player);

					var curMax = 0;
					var curPres = null;
					for(var player in game.elections.schedule[game.elections.current].votes) {
						var votes = game.elections.schedule[game.elections.current].votes[player];
						var total = 0;
						votes.forEach(function(vote) {
							total += vote.amount;
						});

						if(total == curMax)
							curPres = null;

						if(total > curMax) {
							curMax = total;
							curPres = player;
						}
					}
					game.elections.schedule[game.elections.current].result = curPres;
					if(curPres !== null)
						game.corporations[game.elections.schedule[game.elections.current].corporation].president = curPres;
					game.emit('election results', game.elections.schedule[game.elections.current]);
					game.elections.current++;
					game.elections.time = WGDS.TIME_PER_ELECTION;
					game.elections.voters = [];
					if(game.elections.current < game.elections.schedule.length)
						game.update('elections');
				}

				if(game.elections.current >= game.elections.schedule.length) {
					game.elections.current = -1;
					game.update('elections');
					game.nextTurn();
					return;
				}
				
				var afterVote = true;
				for(var player in game.players) {
					if(game.players[player].socket && game.elections.voters.indexOf(player) == -1) {
						var corp = game.corporations[game.elections.schedule[game.elections.current].corporation];
						for(var investor in corp.investors) {
							if(investor == player && corp.investors[investor] > 0)
								afterVote = false;
							else if(investor.match(/^corp_(\d+)$/) && corp.investors[investor] > 0 &&
									game.corporations[RegExp.$1].president == player)
								afterVote = false
						}
					}
				}
				if(afterVote && game.elections.time > WGDS.TIME_PER_ELECTION_AFTER_VOTE)
					game.elections.time = WGDS.TIME_PER_ELECTION_AFTER_VOTE;

				setTimeout(game.tickElections,1000,game);
				game.emit('election time',game.elections.time);
			},

			tickTurn: function(game) {
				if(!game.paused)
					game.time--;

				game.emit('time',game.time);
				var actionsAvailable = false;
				for(var player in game.players) {
					if(game.players[player].actions > 0 && game.players[player].socket != '')
						actionsAvailable = true;
				}
				if(!actionsAvailable || game.time <= 0)
					game.endTurn();
				else
					setTimeout(game.tickTurn,1000,game);
			}
		};
	},
	games: {},
	users: {},
	
	listGames: function() {
		var list = [];
		for(var game in this.games) {
			var state = 'läuft (Runde '+this.games[game].turn+')';
			if(this.games[game].turn == 0)
				state = 'noch nicht gestartet'
			if(this.games[game].turn < -1)
				state = 'abschliessende Wahlen'
			if(this.games[game].turn == -1) {
				state = 'beendet'
				if(this.games[game].winner === null)
					state += ' (unentschieden)'
				else
					state += ' (Gewinner: '+this.games[game].winner+')'
			}
			list.push({
				'name': this.games[game].name,
				'turn': this.games[game].turn,
				'players': Object.keys(this.games[game].players).length,
				'state': state
			});
		}
		return list;
	},
	listUsers: function() {
		return Object.keys(this.users);
	}
}

io.on('connection', function(socket) {
	socket.on('chat message', function(message) {
		console.log('Chat: <%s> %s',socket.username, message);
		if(socket.gamename) {
			io.to('game_'+socket.gamename).emit('chat message', {
				username: socket.username,
				message: message
			});
			if(message.indexOf('/cheat') == 0) {
				WGDS.games[socket.gamename].emit('status', '/cheat-Befehl von '+socket.username+'!');
				var tokens = message.split(' ');
				if(tokens[1] == 'endturn' && WGDS.games[socket.gamename].time > 0) {
					WGDS.games[socket.gamename].time = 1;
				}
				if(tokens[1] == 'endgame' && WGDS.games[socket.gamename].time > 0 &&
				   WGDS.games[socket.gamename].turn > 0) {
					WGDS.games[socket.gamename].turn = WGDS.MAX_TURNS_PER_GAME;
					WGDS.games[socket.gamename].time = 1;
				}
				if(tokens[1] == 'action' && WGDS.games[socket.gamename].turn > 0) {
					for(var player in WGDS.games[socket.gamename].players) {
						if(tokens[2] && player != tokens[2]) continue;
						WGDS.games[socket.gamename].players[player].actions += parseInt(tokens[3])||1;
					}
				}
				if(tokens[1] == 'presi' && WGDS.games[socket.gamename].turn > 0) {
					if(!tokens[3]) {
						if(WGDS.games[socket.gamename].corporations[tokens[2]])
							WGDS.games[socket.gamename].corporations[tokens[2]].president = null;
					} else {
						if(WGDS.games[socket.gamename].corporations[tokens[2]] &&
						   WGDS.games[socket.gamename].players[tokens[3]])
							WGDS.games[socket.gamename].corporations[tokens[2]].president = tokens[3];
					}
				}
				if(tokens[1] == 'pause') {
					WGDS.games[socket.gamename].paused = !WGDS.games[socket.gamename].paused;
				}
				if(tokens[1] == 'tweak') {
					if(typeof WGDS[tokens[2]] == 'number')
						WGDS[tokens[2]] = parseInt(tokens[3]);
				}
				WGDS.games[socket.gamename].update();
			}
		} else {
			io.to('_lobby').emit('chat message', {
				username: socket.username,
				message: message
			});
		}
	});

	socket.on('lobby login', function(username) {
		if(socket.username) return;
		username = username.replace(/[^A-Za-z0-9äöüÄÖÜ !?+*\/-]/g,'');
		if(username == '' || WGDS.users[username] || username.match(/^\d+$/)) {
			socket.emit('general error', {type:'login', msg:'Name wird bereits verwendet.'});
			return;
		}
		socket.username = username;
		WGDS.users[username] = socket;
		console.log('Lobby: user "%s" connected',socket.username);

		socket.emit('login ok',username);

		socket.join('_lobby');
		socket.emit('lobby gamelist', WGDS.listGames());
		io.to('_lobby').emit('lobby userlist', WGDS.listUsers());
	});

	socket.on('lobby create game', function(gamename) {
		gamename = gamename.replace(/[^A-Za-z0-9äöüÄÖÜ !?+*\/-]/g,'');
		if(gamename == '' || WGDS.games[gamename]) {
			socket.emit('general error', {type:'lobby', msg:'Spiel existiert bereits.'});
			return;
		}
		WGDS.games[gamename] = WGDS.newGame(gamename);
		lobbyJoinGame(gamename);
	});
	var lobbyJoinGame = function(gamename) {
		gamename = gamename.replace(/[^A-Za-z0-9äöüÄÖÜ !?+*\/-]/g,'');
		if(!WGDS.games[gamename]) {
			socket.emit('general error', {type:'lobby', msg:'Spiel existiert nicht (mehr).'});
			return;
		}

		// if not in 'pregame' state, or already full, only allow re-joining
		if(WGDS.games[gamename].turn !== 0 ||
			Object.keys(WGDS.games[gamename].players).length >= WGDS.MAX_PLAYERS_PER_GAME) {
			if(!WGDS.games[gamename].players[socket.username] || WGDS.games[gamename].players[socket.username].socket) {
				socket.emit('general error', {type:'lobby', msg:'Spiel läuft schon oder ist voll.'});
				return;	
			} else {
				WGDS.games[gamename].players[socket.username].socket = socket.id;
			}
		} else {
				WGDS.games[gamename].players[socket.username] = {
					'socket': socket.id,
					'name': socket.username,
					'shares': WGDS.SHARES_PER_PLAYER,
					'sharesAvailable': WGDS.SHARES_PER_PLAYER,
					'actions': 0,
					'color': WGDS.PLAYER_COLORS[Object.keys(WGDS.games[gamename].players).length]
				}
		}
		socket.emit('lobby join ok',gamename);
		socket.leave('_lobby');
		socket.gamename = gamename;
		socket.join('game_'+gamename);
		WGDS.games[gamename].emit('playerjoin',socket.username);
		WGDS.games[gamename].update();

		io.to('_lobby').emit('lobby gamelist', WGDS.listGames());
	}
	socket.on('lobby join game', lobbyJoinGame);

	socket.on('game start', function() {
		if(!socket.gamename||WGDS.games[socket.gamename].turn !== 0) return;
		WGDS.games[socket.gamename].emit('status','Das Spiel wurde gestartet!');
		WGDS.games[socket.gamename].nextTurn();
	});
	socket.on('game corporation leave', function() {
		if(!socket.gamename||WGDS.games[socket.gamename].turn < 1) return;		
		if(WGDS.games[socket.gamename].players[socket.username].actions < 1) return;
		WGDS.games[socket.gamename].players[socket.username].actions--;
		WGDS.games[socket.gamename].update();
	});
	socket.on('game corporation elect', function(corporation) {
		if(!socket.gamename||WGDS.games[socket.gamename].turn < 1) return;		
		if(WGDS.games[socket.gamename].players[socket.username].actions < 1) return;
		WGDS.games[socket.gamename].players[socket.username].actions--;
		if(!WGDS.games[socket.gamename].corporations[corporation]) return;

		WGDS.games[socket.gamename].scheduleElection(corporation);

		WGDS.games[socket.gamename].update();
	});
	socket.on('game resetpersonal', function() {
		if(!socket.gamename||WGDS.games[socket.gamename].turn < 1) return;		
		if(WGDS.games[socket.gamename].players[socket.username].actions < 1) return;
		WGDS.games[socket.gamename].players[socket.username].actions--;
		WGDS.games[socket.gamename].players[socket.username].sharesAvailable = WGDS.games[socket.gamename].players[socket.username].shares;
		
		WGDS.games[socket.gamename].corporations.forEach(function(corp) {
			if(corp.ch && corp.investors[socket.username])
				WGDS.games[socket.gamename].players[socket.username].sharesAvailable -= corp.investors[socket.username];
			else
				delete corp.investors[socket.username];
		});
		WGDS.games[socket.gamename].update();
	});
	socket.on('game election vote', function(player) {
		if(!socket.gamename||WGDS.games[socket.gamename].elections.current == -1) return;
		WGDS.games[socket.gamename].vote(socket.username,player);
		WGDS.games[socket.gamename].update('elections');
	});
	socket.on('game corporation modify', function(data) {
		if(!socket.gamename||WGDS.games[socket.gamename].turn < 1) return;		
		if(WGDS.games[socket.gamename].players[socket.username].actions < 1) return;
		WGDS.games[socket.gamename].players[socket.username].actions--;
		if(!WGDS.games[socket.gamename].corporations[data.corporation]) return;
		if(data.type == 'add') {
			for(var change in data.changes) {
				if(data.changes[change] == 0) continue;
				if(change.match(/^corp_(\d+)$/)) {
					if(!WGDS.games[socket.gamename].corporations[RegExp.$1]) continue;
					if(WGDS.games[socket.gamename].corporations[RegExp.$1].president !== socket.username) continue;
					if(data.changes[change] > WGDS.games[socket.gamename].corporations[RegExp.$1].sharesAvailable) continue;
					WGDS.games[socket.gamename].corporations[RegExp.$1].sharesAvailable -= data.changes[change];
				} else if(change == socket.username) {
					if(data.changes[change] > WGDS.games[socket.gamename].players[socket.username].sharesAvailable) continue;
					WGDS.games[socket.gamename].players[socket.username].sharesAvailable -= data.changes[change];
				} else {
					continue; // neither a corporation, nor the own user name - cheating?
				}
				if(!WGDS.games[socket.gamename].corporations[data.corporation].investors[change])
					WGDS.games[socket.gamename].corporations[data.corporation].investors[change] = data.changes[change];
				else
					WGDS.games[socket.gamename].corporations[data.corporation].investors[change] += data.changes[change];
			}
		} else if(data.type == 'rem') {
			for(var change in data.changes) {
				if(data.changes[change] > WGDS.games[socket.gamename].corporations[data.corporation].investors[change]) continue;
				if(change.match(/^corp_(\d+)$/)) {
					if(!WGDS.games[socket.gamename].corporations[RegExp.$1]) continue;
					if(WGDS.games[socket.gamename].corporations[RegExp.$1].president !== socket.username) continue;
					WGDS.games[socket.gamename].corporations[RegExp.$1].sharesAvailable += data.changes[change];
				} else if(change == socket.username) {
					WGDS.games[socket.gamename].players[socket.username].sharesAvailable += data.changes[change];
				} else {
					continue; // neither a corporation, nor the own user name - cheating?
				}
				WGDS.games[socket.gamename].corporations[data.corporation].investors[change] -= data.changes[change];
				if(WGDS.games[socket.gamename].corporations[data.corporation].investors[change] == 0)
					delete WGDS.games[socket.gamename].corporations[data.corporation].investors[change];
			}
		}
		WGDS.games[socket.gamename].update();
	});

	socket.on('game quit', function() {
		if(!socket.gamename) return;
		WGDS.games[socket.gamename].players[socket.username].socket = null;
		WGDS.games[socket.gamename].emit('playerquit',socket.username);
		WGDS.games[socket.gamename].update();
		
		var game = socket.gamename;
		socket.leave('game_'+socket.gamename);
		socket.gamename = null;
		socket.join('_lobby');
		socket.emit('game quit');
		
		io.to('_lobby').emit('lobby gamelist', WGDS.listGames());
		io.to('_lobby').emit('lobby userlist', WGDS.listUsers());
	});
	socket.on('disconnect', function() {
		if(socket.username) {
			console.log('disconnect of "%s"',socket.username);
			delete WGDS.users[socket.username];
			io.to('_lobby').emit('lobby userlist', WGDS.listUsers());
		}
		if(socket.gamename) {
			// if still in pre-game, delete the player. otherwise, allow re-joining
			if(WGDS.games[socket.gamename].turn == 0) {
				delete WGDS.games[socket.gamename].players[socket.username];
				var color = 0;
				for(var player in WGDS.games[socket.gamename].players)
					WGDS.games[socket.gamename].players[player].color = WGDS.PLAYER_COLORS[color++];
			} else {
				WGDS.games[socket.gamename].players[socket.username].socket = null;
			}
			WGDS.games[socket.gamename].emit('playerquit',socket.username);
			WGDS.games[socket.gamename].update();

			socket.gamename = null;

			io.to('_lobby').emit('lobby gamelist', WGDS.listGames());
		}
	});
});

setInterval(function() {
	var deleted = false;
	for(var game in WGDS.games) {
		if((WGDS.games[game].turn == -1) || (WGDS.games[game].turn == 0)) {
			var orphan = true;
			for(var player in WGDS.games[game].players)
				if(WGDS.games[game].players[player].socket)
					orphan = false;
			if(orphan) {
				delete WGDS.games[game];
				deleted = true;
			}
		}
	}
	io.to('_lobby').emit('lobby gamelist', WGDS.listGames());
}, 600000);
