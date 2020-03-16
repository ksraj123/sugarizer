// Rebase require directory
requirejs.config({
	baseUrl: "lib",
	paths: {
		activity: "../js"
	}
});

// To add -
	// replay - reply from a specific move in history - will be always active in vs computer and active only at end in mutltiplayer
	// test of bugs in spectatorMode - multiplayer mode
			// Done - // it does not seem to be working on electron
			// Done - // some error in spectator mode in electron console
	// maybe add audio as well
			// Done - // when the guest quits without making his move then the game gets stuck
	// when gues puits then host can continue with ai but when host quits then guest can't
	// Difficulty button
			// Done - // even if shared if the number of players is 1 then the computer should play
			// Done - // use buddy fill colours to show your own moves and colors of other person so show possible moves of the other person
			// Done - // more than two users should not be able to join
	// a feature to play the entire game - kind of a player mode - can click on anywhere on the log and play the game from there.
			// Done - // possible moves heightlighting for only own color in multiplayer
			// Done - // current board state not being sent when new user joins - reset or continue?
			// Done - // continue with ai when when person leaves?
	// handle game ends like checkouts draws etc
	// add themeing and undo functionality
	// add logs
	// some problems in resizing
	// add the moves played thing
	// handle promotion

new Vue({
	el: '#app',

	data: {
		position: null,
		Chess: null,
		AI: null,
		Chessboard: null,
		user: null,
		spectatorMode: false,
		aiMode: true,
		difficulty: 2,
		currentUsers: [],
		isHost: true,
		palette: null,
		presence: null,
		gameHistory: null,
		gameStatus: null
	},

	created: function() {
		var vm = this;
		requirejs(["sugar-web/activity/activity", "sugar-web/env"], function(activity, env) {
			// Initialize Sugarizer
			activity.setup();
			env.getEnvironment(function(err, environment) {
				vm.user = environment.user;
				document.getElementById("canvas").style.backgroundColor = environment.user.colorvalue.fill;
			})
		});
	},

	mounted: function() {
		var vm = this;
		requirejs(["sugar-web/activity/activity", "sugar-web/env", "sugar-web/graphics/presencepalette"], function(activity, env, presencepalette) {
			env.getEnvironment(function(err, environment) {

				env.getEnvironment(function(err, environment) {
					vm.currentUser = environment.user;
				});
				vm.resetBoard();
				
				// Shared instances
				if (environment.sharedId) {
					console.log("Shared instance");
					vm.isHost = false;
					vm.presence = activity.getPresenceObject(function(error, network) {
						if(error) {
							console.log(error);
						}
						console.log('Presence created');
						network.onDataReceived(vm.onNetworkDataReceived);
						network.onSharedActivityUserChanged(vm.onNetworkUserChanged);
					});
				} else if (environment.objectId) {
					// Load context - dont load context in shared instance
					activity.getDatastoreObject().loadAsText(function(error, metadata, data) {
						if (error == null && data != null) {
							vm.Chess = new Chess(data);
							vm.position = vm.Chess.fen();
							vm.AI = p4_fen2state(vm.position);
						} else {
							console.log("Error loading from journal");
						}
					});
				}

				if (!vm.isHost){
					vm.Chessboard.flip();
				}
			});

			// Link presence palette
			vm.palette = new presencepalette.PresencePalette(document.getElementById("network-button"), undefined);
			vm.palette.addEventListener('shared', function() {
				vm.palette.popDown();
				console.log("Want to share");
				vm.presence = activity.getPresenceObject(function(error, network) {
					if (error) {
						console.log("Sharing error");
						return;
					}
					network.createSharedActivity('org.sugarlabs.ChessActivity', function(groupId) {
						console.log("Activity shared");
					});
					console.log('presence created', vm.presence);
					network.onDataReceived(vm.onNetworkDataReceived);
					network.onSharedActivityUserChanged(vm.onNetworkUserChanged);
				});
			});

			requirejs(["sugar-web/graphics/palette"],
				function (palette, doc) {
					if (vm.spectatorMode)	return;
					var difficultyButton = document.getElementById("difficulty-button");
					var difficultyPalette = new palette.Palette(difficultyButton, "Diffculty");
					var sampleText = document.createElement('div');
					sampleText.innerHTML = '<div ><label><input type="radio" name="difficulty" value="0">Very Easy</label></div>\
					<div><label><input type="radio" name="difficulty" value="1">Easy</label></div>\
					<div><label><input type="radio"  checked="checked" name="difficulty" value="2">Moderate</label></div>\
					<div><label><input type="radio" name="difficulty" value="3">Hard</label></div>\
					<div><label><input type="radio" name="difficulty" value="4">Very Hard</label></div>'
					difficultyPalette.setContent([sampleText]);
					var allInputs = document.querySelectorAll('input[type="radio"]');
					for (const input of allInputs){
						input.addEventListener('click', function(event){
							vm.changeDifficulty(event.target.value);
						})
					}
				}
			);
			vm.renderGameStatus();

		})

		window.addEventListener("resize", function() {
			vm.Chessboard.resize();
		});
	},

	watch: {
		position: function(newPosition){
			this.Chessboard.position(newPosition);
		},

		// handles the situation where the guest quits without making his move
		aiMode: function(newVal, oldVal){
				console.log("New aiMode = " + this.aiMode);
				if (newVal){
					this.moveComputer();
				}
				this.renderGameStatus();
		},

		currentUsers: function(){
			this.renderMembersList();
			this.renderGameStatus();
		}
	},

	methods: {

		undo: function(){
			// no undo in multiplayer
			if (!this.aiMode)	return;
			this.Chess.undo();
			this.Chess.undo();
			this.Chessboard.position(this.Chess.fen());
			this.position = this.Chess.fen();
			this.AI = p4_fen2state(this.position);
		},
		
		changeDifficulty: function(newDifficulty){
			console.log("Difficulty  = " + newDifficulty);
			this.difficulty = newDifficulty;
		},

		getBuddyIcon: function(userName){
			var buddyIcon = document.createElement("div");
			buddyIcon.className = "buddy";
			buddyIcon.title = userName;
			return buddyIcon;
		},

		renderGameStatus: function(){
			var vm = this;
			var gameStatusDisplay = document.getElementById("game-status");
			gameStatusDisplay.innerHTML = "";
			requirejs(["sugar-web/graphics/icon"], function(icon){
				var vs = document.createElement("span");
				vs.innerText = "vs";
				console.log(vm.user.colorvalue);
				if (vm.aiMode || vm.currentUsers.length === 1){
					gameStatusDisplay.innerHTML = "";
					var buddyIcon = vm.getBuddyIcon(vm.user.name);
					gameStatusDisplay.appendChild(buddyIcon);
					icon.colorize(buddyIcon, vm.user.colorvalue);
					gameStatusDisplay.appendChild(vs);
					var computer = document.createElement("div");
					computer.className = "computer";
					computer.title = "Computer"
					gameStatusDisplay.appendChild(computer);
				} else {
					gameStatusDisplay.innerHTML = "";
					var playerWhite = vm.getBuddyIcon(vm.currentUsers[0].name);
					gameStatusDisplay.appendChild(playerWhite);
					icon.colorize(playerWhite, vm.currentUsers[0].colorvalue);
					gameStatusDisplay.appendChild(vs);
					var playerBlack = vm.getBuddyIcon(vm.currentUsers[1].name);
					gameStatusDisplay.appendChild(playerBlack);
					icon.colorize(playerBlack, vm.currentUsers[1].colorvalue);
				}
			})
		},

		// improve the styling a bit
		renderMembersList: function(){
			var gameMembersDisplay = document.getElementById("game-members");
			gameMembersDisplay.innerHTML = "";
			this.currentUsers.forEach(function(ele, idx){
				if (idx === 0){
					var activeMembers = document.createElement("h3");
					activeMembers.innerText = "Active Members";
					gameMembersDisplay.appendChild(activeMembers);
				}
				var text = document.createElement("span");
				text.innerHTML = (idx <= 1 ? (' player ' + (idx === 0 ? 'white' : 'black')) : ' spectator');
				var buddyIcon = document.createElement("div");
				buddyIcon.className = "buddy";
				buddyIcon.title = ele.name;
				requirejs(["sugar-web/graphics/icon"], function(icon){
					icon.colorize(buddyIcon, ele.colorvalue);
				})
				var member = document.createElement("div");
				member.className = "game-members-member";
				member.appendChild(buddyIcon);
				member.appendChild(text);
				gameMembersDisplay.appendChild(member);
			});
		},

		// this function will be executed everytime a user joins or leaves on all connected users the details of changed user will be passed in as argument
		onNetworkUserChanged: function(msg){
			
			// only the host has correct array of current users after one user joins or leaves
			if (msg.move === 1){
				this.currentUsers.push(msg.user);
			} else {
				this.currentUsers = this.currentUsers.filter(function(ele){
					if (ele.networkId === msg.user.networkId)	return false;
					return true;
				});
			}

			if (this.currentUsers.length === 1){
				this.aiMode = true;
				return
			};

			// all messages are sent to all in precense
			if (this.isHost) {
				this.presence.sendMessage(this.presence.getSharedInfo().id, {
					user: this.presence.getUserInfo(),
					content: {
						action: 'init',
						currentUsers: this.currentUsers,
						data: this.position
					}
				});
			}
		},

		onNetworkDataReceived: function(msg){
			console.log("On netwrok data recieved!");
			// no one recieves their own message as there is no point
			// if (this.presence.getUserInfo().networkId === msg.user.networkId) {
			// 	return;
			// }
			switch(msg.content.action){
				case 'init':
					this.currentUsers = (msg.content.currentUsers).slice(0);
					break;
			}

			var currentUserNetId = this.presence.getUserInfo().networkId;
			console.log("current user = " + currentUserNetId);
			
			if (this.currentUsers[0].networkId == currentUserNetId){
				this.isHost = true;
				this.spectatorMode = false;				
			} else if (this.currentUsers[1].networkId == currentUserNetId){
				this.isHost = false;
				this.spectatorMode = false;
			} else {
				this.spectatorMode = true;
			}

			if (this.currentUsers.length <= 1){
				console.log("herererer");
				this.aiMode = true;
			} else {
				this.aiMode = false;
			}

			this.Chess.load(msg.content.data);
			this.AI = p4_fen2state(msg.content.data);
			this.Chessboard.position(msg.content.data);
		},

		onDropPiece: function(source, target){
			this.removeGreySquares();
			if (target === 'offboard') {
				return;
			}
			if (source === target){
				return;
			}
			var userMove = this.Chess.move({ from: source, to: target, promotion: 'q'});
			
			if (userMove === null)	return 'snapback';
			this.position = this.Chess.fen();
			
			this.AI.move(source, target);
			console.log("in drop piece presence! " + this.aiMode);
			if (this.presence && !this.aiMode) {
				this.presence.sendMessage(this.presence.getSharedInfo().id, {
					user: this.presence.getUserInfo(),
					content: {
						data: this.position
					}
				});
			} else {
				this.moveComputer();
			}
		},

		resetBoard: function(){
			this.Chessboard = Chessboard('myBoard', {
				pieceTheme: "icons/chesspieces/{piece}.svg",
				draggable: true,
				dropOffBoard: 'snapback',
				position: 'start',
				onDrop: this.onDropPiece,
				onDragStart: this.onDragStart,
				onMouseoverSquare: this.onMouseoverSquare,
				onMouseoutSquare: this.onMouseoutSquare,
				onSnapEnd: this.onSnapEnd
			})
			
			this.AI = p4_fen2state(P4_INITIAL_BOARD);
			this.Chess = new Chess();
			this.position = this.Chess.fen();

			if (this.presence) {
				this.presence.sendMessage(this.presence.getSharedInfo().id, {
					user: this.presence.getUserInfo(),
					content: {
						data: this.position
					}
				});
			}

		},

		moveComputer(){
			console.log("In move computer!");
			if (this.Chess.turn() === 'w') return;
			let moves = this.AI.findmove(this.difficulty + 1);
			let start = String.fromCharCode(96+(moves[0]%10)) + (Math.floor(moves[0]/10)-1);
			let end = String.fromCharCode(96+(moves[1]%10)) + (Math.floor(moves[1]/10)-1);
			this.Chess.move({from: start, to: end });
			this.AI.move(start + '-' + end);
			this.position = this.Chess.fen();

			// if (this.Chess.in_checkmate()){
			// 	console.log('Checkmate!!!! Game Over!!');
			// } else if (this.Chess.in_draw()){
			// 	console.log('Match Draw!!');
			// } else {
			// 	this.game.i
			// }
		},

		onDragStart: function(source, piece) {
			// prevent the spectator from moving pieces
			console.log("from spectator " + this.spectatorMode);
			
			if (this.spectatorMode)	return false;

			// prevent drag when game is already over
			if (this.Chess.game_over()) return false

			// or if it's not that side's turn
			if ((this.Chess.turn() === 'w' && piece.search(/^b/) !== -1) ||
					(this.Chess.turn() === 'b' && piece.search(/^w/) !== -1)) {
				return false
			}

			// the host - assumed to be white cannot move pieces of black even if its blacks turn
			if (this.presence){
				console.log("Into presense block! " + this.isHost);
				if (this.isHost){
					if (piece.search(/^b/) !== -1)	return false;
				} else {
					if (piece.search(/^w/) !== -1)	return false;
				}
			}
		},

		onSnapEnd: function() {
			this.Chessboard.position(this.Chess.fen());
		},

		removeGreySquares: function() {
			$('#myBoard .square-55d63').css('background', '')
		},

		lightenColor: function (col, amt) {
			var num = parseInt(col.slice(1),16);
			
			var newValues = [
				(num >> 16) + amt, // red
				((num >> 8) & 0x00FF) + amt, // blue
				(num & 0x0000FF) + amt // green
			]

			newValues = newValues.map(function(value){
				if (value > 255) return 255;
				if (value < 0) return 0;
				return value;
			})
		 
			return "#" + (newValues[2] | (newValues[1] << 8) | (newValues[0] << 16)).toString(16);
		  
		},		

		greySquare: function(square) {
			var buddyColor = this.user.colorvalue.fill;
			var blackSquareGrey = this.lightenColor(buddyColor, -50);
			var whiteSquareGrey = this.lightenColor(buddyColor, 50);
			var $square = $('#myBoard .square-' + square)
		
			var background = whiteSquareGrey
			if ($square.hasClass('black-3c85d')) {
				background = blackSquareGrey
			}
		
			$square.css('background', background)
		},

		onMouseoverSquare: function (square) {
			// get list of possible moves for this square
			var moves = this.Chess.moves({
				square: square,
				verbose: true
			})
		
			// exit if there are no moves available for this square
			if (moves.length === 0) return;

			// in multiplayer mode only allow user to his own possible moves
			if (moves[0].color === 'w' && !this.isHost)	return;
			if (moves[0].color === 'b' && this.isHost)	return;
		
			// highlight the square they moused over
			this.greySquare(square)
		
			// highlight the possible squares for this piece
			for (var i = 0; i < moves.length; i++){
				this.greySquare(moves[i].to)
			}
		},

		onMouseoutSquare: function () {
			this.removeGreySquares()
		},

		stopActivity: function(){
			var vm = this;
			// context not saved when in multiplayer mode as other person can continue with ai
			if (!vm.aiMode) return;
			requirejs(["sugar-web/activity/activity"], function(activity) {
				console.log('writing...');
				activity.getDatastoreObject().setDataAsText(vm.position);
				activity.getDatastoreObject().save(function (error) {
					if (error === null) {
						console.log("write done.");
					} else {
						console.log("write failed.");
					}
				});
			})
		}
	},
});