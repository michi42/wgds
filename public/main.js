$(function() {

	var myUsername = null;
	// Initialize varibles
	var $window = $(window);
	switchPage('login'); $('.usernameInput').focus();
	var game = null;
	var activePage = 'login';
	var privateChatGroup = null;

	var socket = io();
	var $error = $('.errormessage').dialog({
		autoOpen: false,
		modal: true,
		buttons: {
			'Schon gut': function() { $(this).dialog('close'); }
		}
	});

	function switchPage(newPage) {
		$('.pages .page').removeClass('active');
		$('.pages .page.'+newPage).addClass('active');
		$('.page.active .messages').empty();
		activePage = newPage;
		privateChatGroup = null;
	}
	
	function resetChatGroupIfBroadcast() {
		if (!game || privateChatGroup == null) return;
		var isBroadcast = true;
		for (var player in game.players) {
			if (player != myUsername && privateChatGroup.indexOf(player) == -1) {
				isBroadcast = false;
				break;
			}
		}
		if (isBroadcast)
			privateChatGroup = null;
	}
	function addToChatGroup(player) {
		if (privateChatGroup == null) return;
		if (privateChatGroup.indexOf(player) == -1)
			privateChatGroup.push(player)
		resetChatGroupIfBroadcast();
	}
	function removeFromChatGroup(player) {
		if (privateChatGroup == null) {
			privateChatGroup = [];
			for (var p in game.players)
				if (p != myUsername)
					privateChatGroup.push(p);
		}
		var playerIdx = privateChatGroup.indexOf(player);
		if (playerIdx != -1)
			privateChatGroup.splice(playerIdx,1)
		resetChatGroupIfBroadcast();
	}


	function addChatMessage(data) {
		var $usernameDiv = $('<span class="username"/>').text(data.username);
		var $messageBodyDiv = $('<span class="messageBody">').text(data.message);
		addMessage([$usernameDiv, $messageBodyDiv]);
	}
	function addMessage(elements) {
		var $messageDiv = $('<li class="message"/>').append(elements);

		$('.page.active .messages').append($messageDiv);
		$('.page.active .messages')[0].scrollTop = $('.page.active .messages')[0].scrollHeight;
	}
	function error(message) {
		$error.text(message);
		$error.dialog('open');
	}


	// Keyboard events
	$window.keydown(function(event) {
		if (!(event.ctrlKey || event.metaKey || event.altKey))
			$('.page.active .inputMessage').focus();
	});
	$('.inputMessage').keydown(function(ev) {
		if(ev.which == 13) {
			var message = $(this).val();
			if(message) {
				$(this).val('');
				socket.emit('chat message', {
					'message': message,
					'to': privateChatGroup || null
				});
			}
		}
	});

	// Socket events
	socket.on('chat message', function(data) {
		addChatMessage(data);
	});
	socket.on('general error', function(data) {
		error(data.msg);
	});

	// ==== login page ====
	$('.login .usernameInput').keydown(function(ev) {
		if(ev.which == 13)
			socket.emit('lobby login', $('.usernameInput').val());
	});
	socket.on('login ok', function(user) {
		switchPage('lobby');
		myUsername = user;
	});

	// ==== lobby page ====
	var dlg_lobby_newgame = $('.lobby .dlg_newgame').dialog({
		autoOpen: false,
		height: 200,
		width: 350,
		modal: true,
		buttons: {
			'Lieber nicht': function() { dlg_lobby_newgame.dialog('close'); },
			'OK': function() {
				socket.emit('lobby create game', $('.dlg_newgame .gamename').val());
				dlg_lobby_newgame.dialog('close');
			}
		}
	});
	$('.lobby .games').on('click','li',function(ev){
		if($(this).is('.newgame')) {
			$('.dlg_newgame .gamename').val($('.usernameInput').val()+'s Spiel');
			dlg_lobby_newgame.dialog('open');
		} else {
			socket.emit('lobby join game', $('.name',$(this)).text());
		}
	});
	socket.on('lobby userlist', function(list) {
		$('.lobby .players').empty();
		list.forEach(function(name){
			$('<li>').text(name).appendTo($('.lobby .players'));
		});
	});
	socket.on('lobby gamelist', function(list) {
		$('.lobby .games').empty();
		list.forEach(function(game){
			var $li = $('<li>');
			$('<p class="name">').text(game.name).appendTo($li);
			$('<p class="state">').text(game.state).appendTo($li);
			$('<p class="playercount">').text(game.players+' Spieler').appendTo($li);			
			$li.appendTo($('.lobby .games'));
		});
		$('<li class="newgame">').text('Neues Spiel erstellen ...').appendTo($('.lobby .games'));
	});
	socket.on('lobby join ok', function(data) {
		switchPage('game');
	});

	// ==== game page ====
	var dlg_game_corp = $('.game .dlg_corp').dialog({
		dialogClass: 'no-close',
		closeOnEscape: false,
		autoOpen: false,
		width: 500,
		height: 500,
		modal: true,
		buttons: {},
		corporation: null
	});
	var dlg_game_corp_sharemanager = $('.game .dlg_corp_sharemanager').dialog({
		dialogClass: 'no-close',
		closeOnEscape: false,
		autoOpen: false,
		width: 500,
		height: 500,
		modal: true,
		buttons: {
			'Abbrechen': function() {
				$(this).dialog('close');
			    dlg_game_corp.dialog('open');
			},
			'OK': function() {
				// if changeset is empty, the user 'probably' forgot to hit the 'move' button ...
				if(Object.keys(dlg_game_corp_sharemanager.changeset).length == 0)
					if($('.moveamount',dlg_game_corp_sharemanager).val() > 0 && $('.active',dlg_game_corp_sharemanager).length > 0)
						$('.dlg_corp_sharemanager .domove').click();

				var sum = 0;
				for(var change in dlg_game_corp_sharemanager.changeset)
					sum += dlg_game_corp_sharemanager.changeset[change];
				if(dlg_game_corp_sharemanager.managerType == 'add')
					addMessage($('<li class="local">').text(sum+' Aktien in '+game.corporations[dlg_game_corp.corporation].name+' investiert.'));
				else
					addMessage($('<li class="local">').text(sum+' Aktien aus '+game.corporations[dlg_game_corp.corporation].name+' entnommen.'));
				socket.emit('game corporation modify', {
					type: dlg_game_corp_sharemanager.managerType,
					corporation: dlg_game_corp_sharemanager.corporation,
					changes: dlg_game_corp_sharemanager.changeset
				});
				$(this).dialog('close');
			}
		},
		corporation: null,
		managerType: 'add',
		changeset: {}
	});
	var dlg_game_elect = $('.game .dlg_election').dialog({
		dialogClass: 'no-close',
		closeOnEscape: false,
		autoOpen: false,
		width: 800,
		height: 530,
		modal: true,
		buttons: {}
	});
	socket.on('game playerjoin', function(player) {
		addMessage($('<li class="status">').text('Spieler \''+player+'\' hat das Spiel betreten.'));
	});
	socket.on('game playerquit', function(player) {
		addMessage($('<li class="status">').text('Spieler \''+player+'\' hat das Spiel verlassen.'));
	});
	socket.on('game status', function(status) {
		addMessage($('<li class="gamestatus">').text(status));
	});
	socket.on('game closeall', function() {
		$('.ui-dialog-content').dialog('close');
	});
	socket.on('game time', function(time) {
		game.time = time;
		$('.game .statusArea .time span').text(game.time);
	});
	socket.on('game election time', function(time) {
		game.elections.time = time;
		$('.dlg_election .electstatus .time span').text(game.elections.time);
	});
	socket.on('game quit', function() {
		switchPage('lobby');
		$('.ui-dialog-content').dialog('close');
	});
	socket.on('game election results', function(item) {
		var $li = $('<li class="electionresult">');
		$('<h3>').text('Wahlergebnis: '+game.corporations[item.corporation].name).appendTo($li);
		var $list = $('<ul>');
		for(var player in item.votes) {
			var $pl_list = $('<dl>');
			var total = 0;
			item.votes[player].forEach(function(vote) {
				if(vote.source.match(/^corp_(\d+)$/)) {
					var corp = game.corporations[RegExp.$1].name;
					$('<dt>').text(corp).appendTo($pl_list);
				} else {
					$('<dt>').text(vote.source).appendTo($pl_list);
				}
				$('<dd>').text(vote.amount).appendTo($pl_list);
				total += vote.amount;
			});
			
			var $pl = $('<li>').text(player+': '+total+' Stimmen').append($pl_list);
			$list.append($pl);
		}
		$li.append($list);
		if(item.result !== null)
			$('<p class="winner">').text('Neuer Präsident: '+item.result)
				.css({background: game.players[item.result].color}).appendTo($li);
		else
			$('<p class="draw">').text('Aktionäre uneinig! Der aktuelle Präsident bleibt.').appendTo($li);
		addMessage($li);
	});
	socket.on('game update', function(newstate) {
		if(game == null) game = newstate;
		$.extend(game,newstate);
		$('.game .players').empty();
		if (privateChatGroup != null) {
			privateChatGroup = privateChatGroup.filter(function(player) {
				return player in game.players;
			});
			resetChatGroupIfBroadcast();
		}
		for(var player in game.players) {
			var $player = $('<li>').text(player+' ('+game.players[player].sharesAvailable+'/'+game.players[player].shares+')')
				.css({'background': game.players[player].color})
				.data('player', player);
			if (player == myUsername || privateChatGroup == null || privateChatGroup.indexOf(player) >= 0)
				$player.addClass('chat-group');
			$player.appendTo($('.game .players'));
		}

		$('.game .corps').empty();
		game.corporations.forEach(function(corp,i) {
			var css = {};
			if(corp.president !== null)
				css = {'background': game.players[corp.president].color};
			if(!corp.ch)
				$('<li>').text(corp.name+' ('+corp.sharesAvailable+'/'+corp.shares+')').data('corp',i).css(css).appendTo($('.game .corps'));
		});
		game.corporations.forEach(function(corp,i) {
			if(corp.ch)
				$('<li class="ch">').text(corp.name).data('corp',i).appendTo($('.game .corps'));
		});

		$('.game .depot').empty();
		var totalShares = 0;
		// personal
		$('<dt>').text('Persönlich').appendTo($('.game .depot'));
		$('<dd>').text(game.players[myUsername].sharesAvailable).appendTo($('.game .depot'));
		totalShares += game.players[myUsername].sharesAvailable;
		// corporate
		game.corporations.forEach(function(corp) {
			if(corp.president === myUsername) {
				$('<dt>').text(corp.name).appendTo($('.game .depot'));
				$('<dd>').text(corp.sharesAvailable).appendTo($('.game .depot'));
				totalShares += corp.sharesAvailable;
			}
		});
		$('<dt class="total">').text('Total verfügbar').appendTo($('.game .depot'));
		$('<dd class="total">').text(totalShares).appendTo($('.game .depot'));

		$('.game').removeClass('pregame');
		$('.game,body').removeClass('aftergame');
		if(game.turn == 0)
			$('.game').addClass('pregame')
		else if(game.turn < 0)
			$('.game,body').addClass('aftergame')

		if(game.winner === null)
			$('.game .endgame strong').text('');
		else
			$('.game .endgame strong').text('Sieger: '+game.winner);

		$('.game .statusArea .turn span').text(game.turn);
		$('.game .statusArea .actions span').text(game.players[myUsername].actions);
		$('.game .statusArea .time span').text(game.time);
		
		if(game.elections.current == -1) {
			dlg_game_elect.dialog('close');
		} else {
			var curCorp = game.corporations[game.elections.schedule[game.elections.current].corporation];
			if(curCorp.president !== null) {
				$('.corp',dlg_game_elect).text(curCorp.name+' ['+curCorp.president+']')
					.css({'background':game.players[curCorp.president].color});
			} else {
				$('.corp',dlg_game_elect).text(curCorp.name).css({'background':''});
			}
			$('.electstatus .time span',dlg_game_elect).text(game.elections.time);

			var totalVotes = 0;
			$('.investors ul',dlg_game_elect).empty();
			var investors = curCorp.investors;
			for(var investor in investors) {
				if(investor.match(/^corp_(\d+)$/)) {
					var corp = game.corporations[RegExp.$1];
					if(corp.president == myUsername)
						totalVotes += investors[investor];
					$('<li>').text(corp.name+' ('+investors[investor]+')')
						.data('investor',investor).data('amount',investors[investor])
						.css({background: game.players[corp.president].color})
						.appendTo($('.investors ul',dlg_game_elect));
				} else {
					if(investor == myUsername)
						totalVotes += investors[investor];
					$('<li>').text(investor+' ('+investors[investor]+')')
						.data('investor',investor).data('amount',investors[investor])
						.css({background: game.players[investor].color})
						.appendTo($('.investors ul',dlg_game_elect));
				}
			}
			if(game.elections.voters.indexOf(myUsername) != -1)
				totalVotes = 'abgegeben';
			$('.electstatus .votes span',dlg_game_elect).text(totalVotes);
			
			if(totalVotes > 0)
				$('.players',dlg_game_elect).addClass('enabled');
			else
				$('.players',dlg_game_elect).removeClass('enabled');

			$('.upcoming ul',dlg_game_elect).empty();
			game.elections.schedule.forEach(function(item, idx) {
				var css = {};
				if(item.result !== null)
					css.background = game.players[item.result].color;
				if(game.elections.current == idx)
					css.fontWeight = 'bold';
				var requestCntText = item.requests > 1 ? ' ('+item.requests+')' : '';
				$('<li>').text(game.corporations[item.corporation].name+requestCntText).css(css)
					 .appendTo($('.upcoming ul',dlg_game_elect));
			});
			
			$('.players ul',dlg_game_elect).empty();
			for(var player in game.players) {
				var $li = $('<li>');
				$('<div class="name">').text(player).appendTo($li);
				var votes = 0;
				if(game.elections.schedule[game.elections.current].votes[player]) {
					game.elections.schedule[game.elections.current].votes[player].forEach(function(vote) {
						votes += vote.amount;
					});
				}
				$('<div class="status">').text(votes+' Stimmen').appendTo($li);
				$li.css({background: game.players[player].color});
				$li.data('player',player);
				$li.appendTo($('.players ul',dlg_game_elect));
			}
			dlg_game_elect.dialog('open');
		}
	});
	$('.game .startgame').click(function(ev) {
		socket.emit('game start');
	});
	$('.game .quitgame').click(function(ev) {
		socket.emit('game quit');
	});
	$('.game .players').on('click','li',function(ev) {
		var player = $(this).data('player');
		if (player == myUsername) return;
		if ($(this).hasClass('chat-group')) {
			removeFromChatGroup(player);
			$(this).removeClass('chat-group');
		} else {
			addToChatGroup(player);
			$(this).addClass('chat-group');
		}
	});
	$('.game .resetPersonal').click(function(ev) {
		if(game.players[myUsername].actions <= 0) return;
		socket.emit('game resetpersonal');
		addMessage($('<li class="local">').text('Persönliche Aktien zurückgeholt.'));
	});
	$('.game .corps').on('click','li',function(ev) {
		if((game.players[myUsername].actions < 1) && !(game.turn==-1)) return;
		var id = $(this).data('corp');
		dlg_game_corp.corporation = id;
		if(game.corporations[id].ch)
			$(dlg_game_corp).addClass('ch')
		else
			$(dlg_game_corp).removeClass('ch');

		$('.corpstatus .total span',dlg_game_corp).text(game.corporations[id].shares);
		$('.corpstatus .available span',dlg_game_corp).text(game.corporations[id].sharesAvailable);
		$('.corpstatus .president span',dlg_game_corp).text(game.corporations[id].president||'(keiner)');

		$('.corpinvestors ul',dlg_game_corp).empty();
		var investors = game.corporations[dlg_game_corp.corporation].investors;
		for(var investor in investors) {
			if(investor.match(/^corp_(\d+)$/)) {
				var corp = game.corporations[RegExp.$1];
				$('<li>').text(corp.name+' ('+investors[investor]+')')
					.data('investor',investor).data('amount',investors[investor])
					.css({background: game.players[corp.president].color})
					.appendTo($('.corpinvestors ul',dlg_game_corp));
			} else {
				$('<li>').text(investor+' ('+investors[investor]+')')
					.data('investor',investor).data('amount',investors[investor])
					.css({background: game.players[investor].color})
					.appendTo($('.corpinvestors ul',dlg_game_corp));
			}
		}

		dlg_game_corp.dialog('option','title',game.corporations[id].name);
		dlg_game_corp.dialog('open');
	});
	$('.dlg_corp .corpaction_add, .dlg_corp .corpaction_rem').click(function() {
		dlg_game_corp_sharemanager.dialog('option','title',game.corporations[dlg_game_corp.corporation].name);
		if($(this).hasClass('corpaction_add')) {
			dlg_game_corp_sharemanager.managerType = 'add';
			$('.domove',dlg_game_corp_sharemanager).text('>>>');
		} else {
			dlg_game_corp_sharemanager.managerType = 'rem';
			$('.domove',dlg_game_corp_sharemanager).text('<<<');
		}

		// build depot
		$('.depot ul',dlg_game_corp_sharemanager).empty();
		
		if(game.players[myUsername].sharesAvailable > 0) {
			$('<li>').text('Persönlich ('+game.players[myUsername].sharesAvailable+')')
				.data('investor',myUsername).data('amount',game.players[myUsername].sharesAvailable)
				.data('player', myUsername)
				.appendTo($('.depot ul',dlg_game_corp_sharemanager));
		}
		game.corporations.forEach(function(corp,i) {
			if(corp.president === myUsername && corp.sharesAvailable > 0) {
				var $li = $('<li>');
				$li.text(corp.name+' ('+corp.sharesAvailable+')')
					.data('investor','corp_'+i).data('amount',corp.sharesAvailable);
				if(i == dlg_game_corp.corporation)
					$li.addClass('forbidden');
				$li.data('player',myUsername);
				$li.appendTo($('.depot ul',dlg_game_corp_sharemanager));
			}
		});
		
		// build investors
		$('.corpinvestors ul',dlg_game_corp_sharemanager).empty();
		var investors = game.corporations[dlg_game_corp.corporation].investors;
		for(var investor in investors) {
			if(investor.match(/^corp_(\d+)$/)) {
				var corp = game.corporations[RegExp.$1];
				$('<li>').text(corp.name+' ('+investors[investor]+')')
					.data('investor',investor).data('amount',investors[investor])
					.data('player',corp.president)
					.css({background: game.players[corp.president].color})
					.appendTo($('.corpinvestors ul',dlg_game_corp_sharemanager));
			} else {
				$('<li>').text(investor+' ('+investors[investor]+')')
					.data('investor',investor).data('amount',investors[investor])
					.data('player',investor)
					.css({background: game.players[investor].color})
					.appendTo($('.corpinvestors ul',dlg_game_corp_sharemanager));
			}
		}

		$('.domove,.moveamount',dlg_game_corp_sharemanager).css({opacity: 0.1});

		dlg_game_corp_sharemanager.changeset = {};
		dlg_game_corp_sharemanager.corporation = dlg_game_corp.corporation;

	    dlg_game_corp.dialog('close');
		dlg_game_corp_sharemanager.dialog('open');
	});
	$('.dlg_corp .corpaction_leave').click(function() {
	    dlg_game_corp.dialog('close');
		if(game.turn == -1) return;
		socket.emit('game corporation leave', dlg_game_corp.corporation);
		addMessage($('<li class="local">').text(game.corporations[dlg_game_corp.corporation].name+' verlassen.'));
	});
	$('.dlg_corp .corpaction_elect').click(function() {
		socket.emit('game corporation elect', dlg_game_corp.corporation);
		addMessage($('<li class="local">').text('Wahlen in '+game.corporations[dlg_game_corp.corporation].name+' eingeleitet.'));
	    dlg_game_corp.dialog('close');
	});
	$('.dlg_corp_sharemanager .depot ul,.dlg_corp_sharemanager .corpinvestors ul').on('click','li',function(){
		if($(this).data('player') != myUsername) return;
		if($(this).hasClass('forbidden')) return;
		if(dlg_game_corp_sharemanager.managerType == 'add') {
			if($(this).parents('.depot').length == 0) return;
			$('.dlg_corp_sharemanager .depot ul li').removeClass('active');
		} else {
			if($(this).parents('.corpinvestors').length == 0) return;
			$('.dlg_corp_sharemanager .corpinvestors ul li').removeClass('active');
		}
		$(this).addClass('active');
		$('.domove,.moveamount',dlg_game_corp_sharemanager).css({opacity: 1});
		$('.moveamount',dlg_game_corp_sharemanager).val($(this).data('amount'));
		$('.moveamount',dlg_game_corp_sharemanager).attr('max',$(this).data('amount'));
		$('.moveamount',dlg_game_corp_sharemanager).focus();
	});
	$('.dlg_corp_sharemanager .moveamount').keydown(function(ev) {
		if(ev.which == 13)
			$('.dlg_corp_sharemanager .domove').click();
	});
	$('.dlg_corp_sharemanager .domove').click(function() {
		var $src;
		if(dlg_game_corp_sharemanager.managerType == 'add')
			$src = $('.dlg_corp_sharemanager .depot ul li.active');
		else
			$src = $('.dlg_corp_sharemanager .corpinvestors ul li.active');

		if($src.length == 0) return;
		var amount = Math.min($src.data('amount'),$('.moveamount',dlg_game_corp_sharemanager).val());
		if(amount < 0) amount = 0;
		
		if(!dlg_game_corp_sharemanager.changeset[$src.data('investor')])
			dlg_game_corp_sharemanager.changeset[$src.data('investor')] = 0;
		dlg_game_corp_sharemanager.changeset[$src.data('investor')] += amount;
		
		var $target;
		if(dlg_game_corp_sharemanager.managerType == 'add')
			$target = $('.dlg_corp_sharemanager .corpinvestors ul');
		else
			$target = $('.dlg_corp_sharemanager .depot ul');

		$('.new',$target).remove();
		for(var item in dlg_game_corp_sharemanager.changeset) {
			if(item.match(/^corp_(\d+)$/)) {
				var corp = RegExp.$1;
				$('<li class="new">').text(game.corporations[corp].name+' ('+dlg_game_corp_sharemanager.changeset[item]+')')
					.appendTo($target);
			} else {
				$('<li class="new">').text(item+' ('+dlg_game_corp_sharemanager.changeset[item]+')')				
					.appendTo($target);
			}
		}

		$src.data('amount', $src.data('amount')-amount);
		if($src.data('amount') > 0)
			$src.text($src.text().replace(/\(\d+\)$/,'('+$src.data('amount')+')'));
		else
			$src.remove();
		$('.moveamount',dlg_game_corp_sharemanager).val(0);
		$src.removeClass('active');
		$('.domove,.moveamount',dlg_game_corp_sharemanager).css({opacity: 0.1});
	});
	$('.dlg_election').on('click','.players.enabled li',function() {
		$('.dlg_election .players').removeClass('enabled');
		socket.emit('game election vote', $(this).data('player'));
	});
});
