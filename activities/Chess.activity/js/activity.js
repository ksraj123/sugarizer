// Rebase require directory
requirejs.config({
	baseUrl: "lib",
	paths: {
		activity: "../js"
	}
});

// To add -
	// more than two users should not be able to join
	// possible moves heightlighting for only own color in multiplayer
	// current board state not being sent when new user joins - reset or continue?
	// continue with ai when when person leaves?
	// handle game ends like checkouts draws etc
	// add themeing and undo functionality
	// add logs

new Vue({
	el: '#app',

	data: {
		position: '',
		Chess: '',
		AI: '',
		Chessboard:'',
		user: '',
		isHost: true,
		palette: null,
		presence: null
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
		// Load last library from Journal
		var vm = this;
		requirejs(["sugar-web/activity/activity", "sugar-web/env", "sugar-web/graphics/presencepalette"], function(activity, env, presencepalette) {
			env.getEnvironment(function(err, environment) {

				env.getEnvironment(function(err, environment) {
					vm.currentUser = environment.user;
				});
				vm.resetBoard();
				
				// Load context
				if (environment.objectId) {
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
		})
	},

	watch: {
		position: function(newPosition){
			this.Chessboard.position(newPosition);
		}
	},

	methods: {
		
		onNetworkUserChanged: function(){

		},

		onNetworkDataReceived: function(msg){
			this.Chess.load(msg.content);
			this.Chessboard.position(msg.content);
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
			
			if (this.presence) {
				this.presence.sendMessage(this.presence.getSharedInfo().id, {
					user: this.presence.getUserInfo(),
					content: this.position
				});
			} else {
				// what if they disconnect and want to continue game with computer?
				this.AI.move(source, target);
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
		},

		moveComputer(){
			let moves = this.AI.findmove(P4WN_DEFAULT_LEVEL + 1);
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

		greySquare: function(square) {
			var whiteSquareGrey = this.user.colorvalue.stroke;
			var blackSquareGrey = this.user.colorvalue.fill;
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
			console.log(moves);
		
			// exit if there are no moves available for this square
			if (moves.length === 0) return
		
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