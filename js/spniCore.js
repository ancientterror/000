/********************************************************************************
 This file contains the variables and functions that forms the core of the game.
 Anything that is needed game-wide is kept here.
 ********************************************************************************/

/**********************************************************************
 * Game Wide Constants
 **********************************************************************/

/* General Constants */
var DEBUG = false;
var EPILOGUES_ENABLED = true;
var EPILOGUES_UNLOCKED = false;
var COLLECTIBLES_ENABLED = true;
var COLLECTIBLES_UNLOCKED = false;
var EPILOGUE_BADGES_ENABLED = true;
var ALT_COSTUMES_ENABLED = false;
var FORCE_ALT_COSTUME = null;
var USAGE_TRACKING = undefined;
var BASE_FONT_SIZE = 14;
var BASE_SCREEN_WIDTH = 100;

var USAGE_TRACKING_ENDPOINT = 'https://spnati.faraway-vision.io/usage/report';
var BUG_REPORTING_ENDPOINT = 'https://spnati.faraway-vision.io/usage/bug_report';

var CURRENT_VERSION = undefined;
var VERSION_COMMIT = undefined;

/* Game Wide Constants */
var HUMAN_PLAYER = 0;

/* Directory Constants */
var IMG = 'img/';

var backgroundImage;

/*var OPP = 'opponents/';
#The "OPP" folder abbreviation was used to slightly shorten a few lines in spniSelect that looked for opponents in the opponents folder.
#Now that opponents can be specified in any folder, this is no longer required.*/

/* Gender Images */
var MALE_SYMBOL = IMG + 'male.png';
var FEMALE_SYMBOL = IMG + 'female.png';

var includedOpponentStatuses = {};
var alternateCostumeSets = {};

var versionInfo = null;

/* game table */
var tableOpacity = 1;
$gameTable = $('#game-table');

/* useful variables */
var BLANK_PLAYER_IMAGE = "opponents/blank.png";

/* player array */
var players = Array(5);

/* Current timeout ID, so we can cancel it when restarting the game in order to avoid trouble. */
var timeoutID;

/**********************************************************************
 * Game Wide Global Variables
 **********************************************************************/

var table = new Table();
var jsErrors = [];
var sessionID = '';
var gameID = '';
var generalCollectibles = [];
var codeImportEnabled = false;

/**********************************************************************
 * Screens & Modals
 **********************************************************************/

/* Screens */
$warningScreen = $('#warning-screen');
$titleScreen = $('#title-screen');
$selectScreen = $('#main-select-screen');
$individualSelectScreen = $('#individual-select-screen');
$groupSelectScreen = $('#group-select-screen');
$gameScreen = $('#game-screen');
$epilogueScreen = $('#epilogue-screen');
$galleryScreen = $('#gallery-screen');

var allScreens = [$warningScreen, $titleScreen, $selectScreen, $individualSelectScreen, $groupSelectScreen, $gameScreen, $epilogueScreen, $galleryScreen];

/* Modals */
$searchModal = $('#search-modal');
$groupSearchModal = $('#group-search-modal');
$helpModal = $('#help-modal');
$versionModal = $('#version-modal');
$gameSettingsModal = $('#game-settings-modal');
$bugReportModal = $('#bug-report-modal');
$usageTrackingModal = $('#usage-reporting-modal');
$playerTagsModal = $('#player-tags-modal');
$collectibleInfoModal = $('#collectibles-info-modal');
$ioModal = $('#io-modal');

/* Screen State */
$previousScreen = null;

/* CSS rules for arrow offsets */
var bubbleArrowOffsetRules;

/********************************************************************************
 * Game Wide Utility Functions
 ********************************************************************************/

function getReportedOrigin () {
    var origin = window.location.origin;

    if (origin.toLowerCase().startsWith('file:')) {
        return '<local filesystem origin>';
    } else {
        return origin;
    }
}

/* Gathers most of the generic information for an error report. */
function compileBaseErrorReport(userDesc, bugType) {
    var tableReports = [];
    for (let i=1;i<players.length;i++) {
        if (players[i]) {
            playerData = {
                'id': players[i].id,
                'slot': i,
                'stage': players[i].stage,
                'timeInStage': players[i].timeInStage,
                'markers': players[i].markers
            }

            if (players[i].chosenState) {
                playerData.currentLine    = players[i].chosenState.rawDialogue;
                playerData.currentImage   = players[i].folder + players[i].chosenState.image;
            }

            tableReports[i-1] = playerData;
        } else {
            tableReports[i-1] = null;
        }
    }

    var circumstances = {
        'userAgent': navigator.userAgent,
        'origin': getReportedOrigin(),
        'currentRound': currentRound,
        'currentTurn': currentTurn,
        'previousLoser': previousLoser,
        'recentLoser': recentLoser,
        'gameOver': gameOver,
        'visibleScreens': [],
        'rollback': inRollback()
    }

    if (gamePhase) {
        if (inRollback()) {
            circumstances.gamePhase = rolledBackGamePhase[0];
        } else {
            circumstances.gamePhase = gamePhase[0];
        }
    }

    for (let i=0;i<allScreens.length;i++) {
        if (allScreens[i].css('display') !== 'none') {
            circumstances.visibleScreens.push(allScreens[i].attr('id'));
        }
    }

    var bugCharacter = null;
    if (bugType.startsWith('character')) {
        bugCharacter = bugType.split(':', 2)[1];
        bugType = 'character';
    }

    return {
        'date': (new Date()).toISOString(),
        'commit': VERSION_COMMIT,
        'session': sessionID,
        'game': gameID,
        'type': bugType,
        'character': bugCharacter,
        'description': userDesc,
        'circumstances': circumstances,
        'table': tableReports,
        'player': {
            'gender': players[HUMAN_PLAYER].gender,
            'size': players[HUMAN_PLAYER].size,
        },
        'jsErrors': jsErrors,
    };
}

window.addEventListener('error', function (ev) {
    jsErrors.push({
        'date': (new Date()).toISOString(),
        'type': ev.error.name,
        'message': ev.message,
        'filename': ev.filename,
        'lineno': ev.lineno,
        'stack': ev.error.stack
    });

    if (USAGE_TRACKING) {
        var report = compileBaseErrorReport('Automatically generated after Javascript error.', 'auto');

        $.ajax({
            url: BUG_REPORTING_ENDPOINT,
            method: 'POST',
            data: JSON.stringify(report),
            contentType: 'application/json',
            error: function (jqXHR, status, err) {
                console.error("Could not send bug report - error "+status+": "+err);
            },
        });
    }
});

/* Fetch a possibly compressed file.
 * Attempts to fetch a compressed version of the file first,
 * then fetches the uncompressed version of the file if that isn't found.
 */
function fetchCompressedURL(baseUrl, successCb, errorCb) {
    /*
     * The usual Jquery AJAX request function doesn't play nice with
     * the binary-encoded data we'll get here, so we do the XHR manually.
     * (I would use fetch() were it not for compatibility issues.)
     */
    var req = new XMLHttpRequest();
    req.open('GET', baseUrl+'.gz', true);
    req.responseType = 'arraybuffer';

    req.onload = function(ev) {
        if (req.status < 400 && req.response) {
            var data = new Uint8Array(req.response);
            var decompressed = pako.inflate(data, { to: 'string' });
            successCb(decompressed);
        } else if (req.status === 404) {
            $.ajax({
                type: "GET",
        		url: baseUrl,
        		dataType: "text",
                success: successCb,
                error: errorCb,
            });
        } else {
            errorCb();
        }
    }

    req.onerror = function(err) {
        $.ajax({
            type: "GET",
            url: baseUrl,
            dataType: "text",
            success: successCb,
            error: errorCb,
        });
    }

    req.send(null);
}


/**********************************************************************
 *****                Player Object Specification                 *****
 **********************************************************************/

 /************************************************************
  * Creates and returns a new player object based on the
  * supplied information.
  *
  * folder (string), the path to their folder
  * first (string), their first name.
  * last (string), their last name.
  * labels (string or XML element), what's shown on screen and what other players refer to them as.
  *   Can vary by stage.
  * size (string): Their level of endowment
  * intelligence (string or XML element), the name of their AI algorithm.
  *   Can vary by stage.
  * gender (constant), their gender.
  * clothing (array of Clothing objects), their clothing.
  * stamina (integer), time until forfeit is finished (initial timer value).
  * state (array of PlayerState objects), their sequential states.
  * xml (jQuery object), the player's loaded behaviour.xml file.
  * metaXml (jQuery object), the player's loaded meta.xml file.
  ************************************************************/

function Player (id) {
    this.id = id;
    this.folder = 'opponents/'+id+'/';
    this.base_folder = 'opponents/'+id+'/';
    this.first = '';
    this.last = '';
    this.labels = undefined;
    this.folders = undefined;
    this.size = eSize.MEDIUM;
    this.intelligence = eIntelligence.AVERAGE;
    this.gender = eGender.MALE;
    this.stamina = 20;
    this.scale = undefined;
    this.tags = this.baseTags = [];
    this.xml = null;
    this.metaXml = null;

    this.resetState();
}

/*******************************************************************
 * Sets initial values of state variables used by targetStatus,
 * targetStartingLayers etc. adccording to wardrobe.
 *******************************************************************/
Player.prototype.initClothingStatus = function () {
	this.startingLayers = this.clothing.length;
	this.exposed = { upper: true, lower: true };
	for (var position in this.exposed) {
		if (this.clothing.some(function(c) {
			return (c.type == IMPORTANT_ARTICLE || c.type == MAJOR_ARTICLE)
				&& (c.position == position || c.position == FULL_ARTICLE);
		})) {
			this.exposed[position] = false;
		};
	}
	this.mostlyClothed = this.decent = !(this.exposed.upper || this.exposed.lower)
		&& this.clothing.some(function(c) {
			return c.type == MAJOR_ARTICLE
				&& [UPPER_ARTICLE, LOWER_ARTICLE, FULL_ARTICLE].indexOf(c.position) >= 0;
		});
}

/*******************************************************************
 * (Re)Initialize the player properties that change during a game
 *******************************************************************/
Player.prototype.resetState = function () {
    this.out = this.finished = false;
	this.forfeit = "";
	this.stage = this.current = this.consecutiveLosses = 0;
	this.timeInStage = -1;
	this.markers = {};

	if (this.xml !== null) {
        /* Load in the legacy "start" lines, and also
         * initialize player.chosenState to the first listed line.
         * This may be overridden by later updateBehaviour calls if
         * the player has (new-style) selected or game start case lines.
         */
		var allStates = [];

        /* Initialize reaction handling state. */
        this.volatileMatches = [];
        this.bestVolatileMatch = null;
        this.currentTarget = null;
        this.currentPriority = -1;
        this.stateLockCount = 0;
        this.stateCommitted = false;

        this.xml.children('start').children('state').each(function () {
            allStates.push(new State($(this)));
        });

        this.allStates = allStates;
		this.chosenState = this.allStates[0];

        if (!this.chosenState) {
            /* If the opponent does not have legacy start lines then select
             * a new-style selected line immediately.
             * Prevents a crash triggered by selected, unselecting, and re-selecting
             * an opponent with no legacy starting lines.
             */
            this.updateBehaviour(SELECTED);
        }

        this.commitBehaviourUpdate();

        var appearance = this.default_costume;
        if (ALT_COSTUMES_ENABLED && this.alt_costume) {
            appearance = this.alt_costume;
        }

        this.labels = appearance.labels;
        this.folders = appearance.folders;
        this.baseTags = appearance.tags.slice();
        this.labelOverridden = false;

		/* Load the player's wardrobe. */

    	/* Find and grab the wardrobe tag */
    	$wardrobe = appearance.wardrobe;

    	/* find and create all of their clothing */
        var clothingArr = [];
    	$wardrobe.find('clothing').each(function () {
    		var formalName = $(this).attr('formalName');
    		var genericName = $(this).attr('genericName') || $(this).attr('lowercase');
    		var type = $(this).attr('type');
    		var position = $(this).attr('position');
    		var plural = ['true', 'yes'].indexOf($(this).attr('plural')) >= 0;

    		var newClothing = createNewClothing(formalName, genericName, type, position, null, plural, 0);

    		clothingArr.push(newClothing);
    	});
        
        this.poses = appearance.poses;

        this.clothing = clothingArr;
		this.initClothingStatus();
	}

	this.stageChangeUpdate();
}

Player.prototype.getIntelligence = function () {
    return this.intelligence; // Opponent uses getByStage()
};

/* These shouldn't do anything for the human player, but exist as empty functions
   to make it easier to iterate over the entire players[] array. */
Player.prototype.updateLabel = function () { }
Player.prototype.updateFolder = function () { }
Player.prototype.updateBehaviour = function() { }

/* Compute the Player's tags list from their baseTags list. */
Player.prototype.updateTags = function () {
    var tags = [this.id];
    var stage = this.stage || 0;
    
    if (this.alt_costume && this.alt_costume.id) {
        tags.push(this.alt_costume.id);
    }
    
    this.baseTags.forEach(function (tag_desc) {
        if (typeof(tag_desc) === 'string') {
            tags.push(tag_desc);
            return;
        }
        
        if (!tag_desc.tag) return;
        
        var tag = tag_desc.tag;
        var from = parseInt(tag_desc.from, 10);
        var to = parseInt(tag_desc.to, 10);
        
        if (isNaN(to))   to = Number.POSITIVE_INFINITY;
        if (isNaN(from)) from = 0;
        
        if (stage >= from && stage <= to) {
            tags.push(tag);
        }
    });
    
    this.tags = expandTagsList(tags);
}

Player.prototype.stageChangeUpdate = function () {
    this.updateLabel();
    this.updateFolder();
    this.updateTags();
}

Player.prototype.addTag = function(tag) {
    this.baseTags.push(canonicalizeTag(tag));
}

Player.prototype.removeTag = function(tag) {
    tag = canonicalizeTag(tag);
    
    this.baseTags = this.baseTags.filter(function (t) {
        if (typeof(t) === 'string') { return t !== tag };
        if (!t.tag) return false;
        return t.tag !== tag;
    });
}

Player.prototype.hasTag = function(tag) {
    return tag && this.tags && this.tags.indexOf(canonicalizeTag(tag)) >= 0;
};

/*****************************************************************************
 * Subclass of Player for AI-controlled players.
 ****************************************************************************/
function Opponent (id, $metaXml, status, releaseNumber) {
    this.id = id;
    this.folder = 'opponents/'+id+'/';
    this.base_folder = 'opponents/'+id+'/';
    this.metaXml = $metaXml;

    this.status = status;
    this.first = $metaXml.find('first').text();
    this.last = $metaXml.find('last').text();
    this.label = $metaXml.find('label').text();
    this.image = $metaXml.find('pic').text();
    this.gender = $metaXml.find('gender').text();
    this.height = $metaXml.find('height').text();
    this.source = $metaXml.find('from').text();
    this.artist = $metaXml.find('artist').text();
    this.writer = $metaXml.find('writer').text();
    this.description = fixupDialogue($metaXml.find('description').html());
    this.endings = $metaXml.find('epilogue');
    this.ending = this.endings.length > 0 || $metaXml.find('has_ending').text() === "true";
    this.has_collectibles = $metaXml.find('has_collectibles').text() === "true";
    this.collectibles = null;
    this.layers = parseInt($metaXml.find('layers').text(), 10);
    this.scale = Number($metaXml.find('scale').text()) || 100.0;
    this.release = parseInt(releaseNumber, 10) || Number.POSITIVE_INFINITY;
    this.uniqueLineCount = parseInt($metaXml.find('lines').text(), 10) || undefined;
    this.posesImageCount = parseInt($metaXml.find('poses').text(), 10) || undefined;
    this.selected_costume = null;
    this.alt_costume = null;
    this.default_costume = null;
    this.poses = {};
    this.labelOverridden = false;
    this.pendingCollectiblePopup = null;
    
    /* baseTags stores tags that will be later used in resetState to build the
     * opponent's true tags list. It does not store implied tags.
     *
     * The tags list stores the fully-expanded list of tags for the opponent,
     * including implied tags.
     */
    this.baseTags = $metaXml.find('tags').children().map(function() { return canonicalizeTag($(this).text()); }).get();
    this.updateTags();
    
    /* Attempt to preload this opponent's picture for selection. */
    new Image().src = 'opponents/'+id+'/'+this.image;

    this.alternate_costumes = [];
    this.selection_image = this.folder + this.image;
    
    $metaXml.find('alternates').find('costume').each(function (i, elem) {
        var set = $(elem).attr('set') || 'offline';
        
        if (alternateCostumeSets['all'] || alternateCostumeSets[set]) {
            var costume_descriptor = {
                'folder': $(elem).attr('folder'),
                'label': $(elem).text(),
                'image': $(elem).attr('img'),
                'set': set
            };
            
            if (set === FORCE_ALT_COSTUME) {
                this.selection_image = costume_descriptor['folder'] + costume_descriptor['image'];
                this.selectAlternateCostume(costume_descriptor);
            }
            
            this.alternate_costumes.push(costume_descriptor);
        }
    }.bind(this)).get();
}

Opponent.prototype = Object.create(Player.prototype);
Opponent.prototype.constructor = Opponent;

Opponent.prototype.clone = function() {
	var clone = Object.create(Opponent.prototype);
	/* This should be deep enough for our purposes. */
	for (var prop in this) {
		if (this[prop] instanceof Array) {
			clone[prop] = this[prop].slice();
		} else {
			clone[prop] = this[prop];
		}
	}
	return clone;
}

Opponent.prototype.isLoaded = function() {
	return this.xml != undefined;
}

Opponent.prototype.onSelected = function(individual) {
    this.resetState();
    console.log(this.slot+": ");
    console.log(this);
    this.preloadStageImages(-1);
    if (individual) {
        updateAllBehaviours(this.slot, SELECTED, [[OPPONENT_SELECTED]]);
    } else {
        this.updateBehaviour(SELECTED);
        this.commitBehaviourUpdate();
    }

    updateSelectionVisuals();
}

Opponent.prototype.updateLabel = function () {
    if (this.labels && !this.labelOverridden) this.label = this.getByStage(this.labels);
}

Opponent.prototype.updateFolder = function () {
    if (this.folders) this.folder = this.getByStage(this.folders);
}

Opponent.prototype.getByStage = function (arr, stage) {
    if (typeof(arr) === "string") {
        return arr;
    }
    if (stage === undefined) stage = this.stage;
    var bestFitStage = -1;
    var bestFit = null;
    for (var i = 0; i < arr.length; i++) {
        var startStage = arr[i].getAttribute('stage');
        startStage = parseInt(startStage, 10) || 0;
        if (startStage > bestFitStage && startStage <= stage) {
            bestFit = $(arr[i]).text();
            bestFitStage = startStage;
        }
    }
    return bestFit;
};

Opponent.prototype.selectAlternateCostume = function (costumeDesc) {
    if (!costumeDesc) {
        this.selected_costume = null;
        this.selection_image = this.base_folder + this.image;
    } else {
        this.selected_costume = costumeDesc.folder;
        this.selection_image = costumeDesc.folder + costumeDesc.image;
    }
};

Opponent.prototype.getIntelligence = function () {
    return this.getByStage(this.intelligence) || eIntelligence.AVERAGE;
};

Opponent.prototype.loadAlternateCostume = function (individual) {
    if (this.alt_costume) {
        if (this.alt_costume.folder != this.selected_costume) {
            this.unloadAlternateCostume();
        } else {
            return;
        }
    }
    console.log("Loading alternate costume: "+this.selected_costume);
    $.ajax({
        type: "GET",
        url: this.selected_costume+'costume.xml',
        dataType: "text",
        success: function (xml) {
            var $xml = $(xml);

            this.alt_costume = {
                id: $xml.find('id').text(),
                labels: $xml.find('label'),
                tags: [],
                folder: this.selected_costume,
                folders: $xml.find('folder'),
                wardrobe: $xml.find('wardrobe')
            };
            
            var poses = $xml.find('poses');
            var poseDefs = {};
            $(poses).find('pose').each(function (i, elem) {
                var def = new PoseDefinition($(elem), this);
                poseDefs[def.id] = def;
            }.bind(this));
            
            this.alt_costume.poses = poseDefs;

            var costumeTags = this.default_costume.tags.slice();
            var tagMods = $xml.find('tags');
            if (tagMods) {
                var newTags = [];
                tagMods.find('tag').each(function (idx, elem) {
                    var $elem = $(elem);
                    var tag = canonicalizeTag(tag);
                    var removed = $elem.attr('remove') || '';
                    var fromStage = $elem.attr('from');
                    var toStage = $elem.attr('to');

                    // Remove previous declarations for this tag
                    costumeTags = costumeTags.filter(function (t) { return t.tag !== tag; });

                    if (removed.toLowerCase() !== 'true') {
                        newTags.push({'tag': tag, 'from': fromStage, 'to': toStage});
                    }
                });
                
                Array.prototype.push.apply(costumeTags, newTags);
            }

            this.alt_costume.tags = costumeTags;

            this.onSelected(individual);
        }.bind(this),
        error: function () {
            console.error("Failed to load alternate costume: "+this.selected_costume);
        },
    })
}

Opponent.prototype.unloadAlternateCostume = function () {
    if (!this.alt_costume) {
        return;
    }
    
    this.alt_costume = null;
    this.selectAlternateCostume(null);
    this.resetState();
}

Opponent.prototype.loadCollectibles = function (onLoaded, onError) {
    if (!this.has_collectibles) return;
    if (this.collectibles !== null) return;
    
    $.ajax({
		type: "GET",
		url: this.folder + 'collectibles.xml',
		dataType: "text",
		success: function(xml) {
			var collectiblesArray = [];
			$(xml).find('collectible').each(function (idx, elem) {
				collectiblesArray.push(new Collectible($(elem), this));
			}.bind(this));
			
			this.collectibles = collectiblesArray;
            
            if (onLoaded) onLoaded(this);
		}.bind(this),
        error: function (jqXHR, status, err) {
            console.error("Error loading collectibles for "+this.id+": "+status+" - "+err);
            if (onError) onError(this, status, err);
        }.bind(this)
	});
}

/************************************************************
 * Loads and parses the start of the behaviour XML file of the
 * given opponent.
 *
 * The onLoadFinished parameter must be a function capable of
 * receiving a new player object and a slot number.
 ************************************************************/
Opponent.prototype.loadBehaviour = function (slot, individual) {
    this.slot = slot;
    if (this.isLoaded()) {
        if (this.selected_costume) {
            this.loadAlternateCostume();
        } else {
            this.unloadAlternateCostume();
            this.onSelected(individual);
        }
        return;
    }

    fetchCompressedURL(
		'opponents/' + this.id + "/behaviour.xml",
		/* Success callback.
         * 'this' is bound to the Opponent object.
         */
		function(xml) {
            var $xml = $(xml);

            if (this.has_collectibles) {
                this.loadCollectibles();
            }

            this.xml = $xml;
            this.size = $xml.find('size').text();
            this.stamina = Number($xml.find('timer').text());
            this.intelligence = $xml.find('intelligence');

            /* The gender listed in meta.xml and behaviour.xml might differ
             * (for example with gender-revealing characters)
             * So assume behaviour.xml holds the 'definitive' starting gender
             * for the character.
             */
            var startGender = $xml.find('gender').text();
            if (startGender) {
                this.gender = startGender;    
            }

            this.default_costume = {
                id: null,
                labels: $xml.find('label'),
                tags: null,
                folders: this.folder,
                wardrobe: $xml.find('wardrobe')
            };
            
            var poses = $xml.find('poses');
            var poseDefs = {};
            $(poses).find('pose').each(function (i, elem) {
                var def = new PoseDefinition($(elem), this);
                poseDefs[def.id] = def;
            }.bind(this));
            
            this.default_costume.poses = poseDefs;

            var tags = $xml.find('tags');
            var tagsArray = [];
            if (typeof tags !== typeof undefined && tags !== false) {
                tagsArray = $(tags).find('tag').map(function () {
                    return {
                        'tag': canonicalizeTag($(this).text()),
                        'from': $(this).attr('from'),
                        'to': $(this).attr('to'),
                    }
                }).get();
            }

            this.default_costume.tags = tagsArray;

            var targetedLines = {};

            $xml.find('case[target]>state, case[alsoPlaying]>state').each(function() {
                var $case = $(this.parentNode);
                ['target', 'alsoPlaying'].forEach(function(attr) {
                    var id = $case.attr(attr);
                    if (id) {
                        if (!(id in targetedLines)) { targetedLines[id] = { count: 0, seen: {} }; }
                        if (!(this.textContent in targetedLines[id].seen)) {
                            targetedLines[id].seen[this.textContent] = true;
                            targetedLines[id].count++;
                        }
                    }
                }, this);
            });

            this.targetedLines = targetedLines;

            if (this.selected_costume) {
                return this.loadAlternateCostume();
            }
            
            return this.onSelected(individual);
		}.bind(this),
		/* Error callback. */
        function(err) {
            console.log("Failed reading \""+this.id+"\" behaviour.xml");
            delete players[this.slot];
        }.bind(this)
	);
}

Player.prototype.getImagesForStage = function (stage) {
    if(!this.xml) return [];

    var imageSet = {};
    var folder = this.folders ? this.getByStage(this.folders, stage) : this.folder;
    var advPoses = this.poses;
    var selector = (stage == -1 ? 'start, stage[id=1] case[tag=game_start]'
                    : 'stage[id='+stage+'] case');
                    
    this.xml.find(selector).each(function () {
        var target = $(this).attr('target'), alsoPlaying = $(this).attr('alsoPlaying'),
            filter = canonicalizeTag($(this).attr('filter'));
        // Skip cases requiring a character that isn't present
        if ((target === undefined || players.some(function(p) { return p.id === target; }))
            && (alsoPlaying === undefined || players.some(function(p) { return p.id === alsoPlaying; }))
            && (filter === undefined || players.some(function(p) { return p.hasTag(filter); })))
        {
            $(this).children('state').each(function (i, e) {
                var poseName = $(e).attr('img');
                if (!poseName) return;
                
                if (poseName.startsWith('custom:')) {
                    var key = poseName.split(':', 2)[1];
                    var pose = advPoses[key];
                    if (pose) pose.getUsedImages().forEach(function (img) {
                        imageSet[img] = true;
                    });
                } else {
                    imageSet[folder+poseName] = true;
                }
            });
        }
    });
    
    return Object.keys(imageSet);
};

Player.prototype.preloadStageImages = function (stage) {
    this.getImagesForStage(stage)
        .forEach(function(fn) { new Image().src = fn; }, this );
};

/**********************************************************************
 *****              Overarching Game Flow Functions               *****
 **********************************************************************/

/************************************************************
 * Loads the initial content of the game.
 ************************************************************/
function initialSetup () {
    /* start by creating the human player object */
    var humanPlayer = new Player('human'); //createNewPlayer("human", "", "", "", eGender.MALE, eSize.MEDIUM, eIntelligence.AVERAGE, 20, undefined, [], null);
    players[HUMAN_PLAYER] = humanPlayer;
    players[HUMAN_PLAYER].slot = HUMAN_PLAYER;

	/* enable table opacity */
	tableOpacity = 1;
	$gameTable.css({opacity:1});

    /* load the all content */
    loadTitleScreen();
    selectTitleCandy();
    loadVersionInfo();
    loadGeneralCollectibles();
    
	/* Make sure that the config file is loaded before processing the
	   opponent list, so that includedOpponentStatuses is populated. */
    loadConfigFile().always(loadSelectScreen);
    save.load();
    updateTitleGender();

	/* show the title screen */
	$warningScreen.show();
    autoResizeFont();

    /* Generate a random session ID. */
    sessionID = generateRandomID();

    /* Construct a CSS rule for every combination of arrow direction, screen, and pseudo-element */
    bubbleArrowOffsetRules = [];
    for (var i = 1; i <= 4; i++) {
        var pair = [];
        [["up", "down"], ["left", "right"]].forEach(function(p) {
            var index = document.styleSheets[2].cssRules.length;
            var rule = p.map(function(d) {
                return ["select", "game"].map(function(s) {
                    return ["before", "after"].map(function(r) {
                        return '#'+s+'-bubble-'+i+'>.dialogue-bubble.arrow-'+d+'::'+r;
                    }).join(', ');
                }).join(', ');
            }).join(', ') + ' {}';
            document.styleSheets[2].insertRule(rule, index);
            pair.push(document.styleSheets[2].cssRules[index]);
        });
        bubbleArrowOffsetRules.push(pair);
    }
}

function loadVersionInfo () {
    $('.substitute-version').text('Unknown Version');
    
    return $.ajax({
        type: "GET",
		url: "version-info.xml",
		dataType: "text",
		success: function(xml) {
            versionInfo = $(xml);
            CURRENT_VERSION = versionInfo.find('current').attr('version');
            
            $('.substitute-version').text('v'+CURRENT_VERSION);
            console.log("Running SPNATI version "+CURRENT_VERSION);
            
            version_ts = versionInfo.find('changelog > version[number=\"'+CURRENT_VERSION+'\"]').attr('timestamp');        
            
            version_ts = parseInt(version_ts, 10);
            now = Date.now();
            
            elapsed_time = now - version_ts;
            
            /* Format last update time */
            last_update_string = '';
            if (elapsed_time < 5 * 60 * 1000) {
                // <5 minutes ago - display 'just now'
                last_update_string = 'just now';
            } else if (elapsed_time < 60 * 60 * 1000) {
                // < 1 hour ago - display minutes since last update
                last_update_string = Math.floor(elapsed_time / (60 * 1000))+' minutes ago';
            } else if (elapsed_time < 24 * 60 * 60 * 1000) {
                // < 1 day ago - display hours since last update
                var n_hours = Math.floor(elapsed_time / (60 * 60 * 1000));
                last_update_string = n_hours + (n_hours === 1 ? ' hour ago' : ' hours ago');
            } else {
                // otherwise just display days since last update
                var n_days = Math.floor(elapsed_time / (24 * 60 * 60 * 1000));
                last_update_string =  n_days + (n_days === 1 ? ' day ago' : ' days ago');
            }
            
            $('.substitute-version-time').text('(updated '+last_update_string+')')
        }
    });
}


function loadConfigFile () {
	return $.ajax({
        type: "GET",
		url: "config.xml",
		dataType: "text",
		success: function(xml) {
			var _epilogues = $(xml).find('epilogues').text();
            if(_epilogues.toLowerCase() === 'false') {
                EPILOGUES_ENABLED = false;
                console.log("Epilogues are disabled.");
                $("#title-gallery-edge").hide();
            } else {
                console.log("Epilogues are enabled.");
                EPILOGUES_ENABLED = true;
            }

            var _epilogues_unlocked = $(xml).find('epilogues-unlocked').text().trim();
            if (_epilogues_unlocked.toLowerCase() === 'true') {
                EPILOGUES_UNLOCKED = true;
                console.error('All epilogues unlocked in config file. You better be using this for development only and not cheating!');
            } else {
                EPILOGUES_UNLOCKED = false;
            }

            var _epilogue_badges = $(xml).find('epilogue_badges').text();
            if(_epilogue_badges.toLowerCase() === 'false') {
                EPILOGUE_BADGES_ENABLED = false;
                console.log("Epilogue badges are disabled.");
            } else {
                console.log("Epilogue badges are enabled.");
                EPILOGUE_BADGES_ENABLED = true;
            }

			var _debug = $(xml).find('debug').text();

            if (_debug === "true") {
                DEBUG = true;
                console.log("Debugging is enabled");
            }
            else {
                DEBUG = false;
                console.log("Debugging is disabled");
            }

            var _game_commit = $(xml).find('commit').text();
            if (_game_commit) {
                VERSION_COMMIT = _game_commit;
                console.log("Running SPNATI commit "+VERSION_COMMIT+'.');
            } else {
                console.log("Could not find currently deployed Git commit!");
            }

            var _alts = $(xml).find('alternate-costumes').text();

            if(_alts === "true") {
                ALT_COSTUMES_ENABLED = true;
                console.log("Alternate costumes enabled");
                
                FORCE_ALT_COSTUME = $(xml).find('force-alternate-costume').text();
                if (FORCE_ALT_COSTUME) {
                    console.log("Forcing alternate costume set: "+FORCE_ALT_COSTUME);
                    alternateCostumeSets[FORCE_ALT_COSTUME] = true;
                } else {
                    $(xml).find('alternate-costume-sets').each(function () {
                        var set = $(this).text();
                        alternateCostumeSets[set] = true;
                        if (set === 'all') {
                            console.log("Including all alternate costume sets");
                        } else {
                            console.log("Including alternate costume set: "+set);
                        }
                    });
                }
            } else {
                ALT_COSTUMES_ENABLED = false;
                console.log("Alternate costumes disabled");
            }
            
            if (DEBUG) {
                COLLECTIBLES_ENABLED = false;
                COLLECTIBLES_UNLOCKED = false;
                
                if ($(xml).find('collectibles').text() === 'true') {
                    COLLECTIBLES_ENABLED = true;
                    console.log("Collectibles enabled");
                    
                    if ($(xml).find('collectibles-unlocked').text() === 'true') {
                        COLLECTIBLES_UNLOCKED = true;
                        console.log("All collectibles force-unlocked");
                    }
                } else {
                    console.log("Collectibles disabled");
                }
            } else {
                COLLECTIBLES_ENABLED = false;
                COLLECTIBLES_UNLOCKED = false;
                console.log("Debug mode disabled - collectibles disabled");
            }

			$(xml).find('include-status').each(function() {
				includedOpponentStatuses[$(this).text()] = true;
				console.log("Including", $(this).text(), "opponents");
			});
		}
	});
}

function loadGeneralCollectibles () {
    $.ajax({
		type: "GET",
		url: 'opponents/general_collectibles.xml',
		dataType: "text",
		success: function(xml) {
			var collectiblesArray = [];
			$(xml).find('collectible').each(function (idx, elem) {
				generalCollectibles.push(new Collectible($(elem), undefined));
			});
		},
        error: function (jqXHR, status, err) {
            console.error("Error loading general collectibles: "+status+" - "+err);
        }
	});
}


function enterTitleScreen() {
    $warningScreen.hide();
    $titleScreen.show();
}

/************************************************************
 * Transitions between two screens.
 ************************************************************/
function screenTransition (first, second) {
	first.hide();
	second.show();
}

/************************************************************
 * Switches to the next screen based on the screen provided.
 ************************************************************/
function advanceToNextScreen (screen) {
    if (screen == $titleScreen) {
        /* advance to the select screen */
		screenTransition($titleScreen, $selectScreen);

    } else if (screen == $selectScreen) {
        /* advance to the main game screen */
        $selectScreen.hide();
		loadGameScreen();
        $gameScreen.show();
    }
}

/************************************************************
 * Switches to the last screen based on the screen provided.
 ************************************************************/
function returnToPreviousScreen (screen) {
    if (screen == $selectScreen) {
        /* return to the title screen */
        $selectScreen.hide();
        $titleScreen.show();
    }
}

/************************************************************
 * Resets the game state so that the game can be restarted.
 ************************************************************/
function resetPlayers () {
    players.forEach(function(p) {
        p.resetState();
    });
    updateAllBehaviours(null, null, SELECTED);
}

/************************************************************
 * Restarts the game.
 ************************************************************/
function restartGame () {
    KEYBINDINGS_ENABLED = false;

	clearTimeout(timeoutID); // No error if undefined or no longer valid
	timeoutID = autoForfeitTimeoutID = undefined;
	stopCardAnimations();
	resetPlayers();

	/* enable table opacity */
	tableOpacity = 1;
	$gameTable.css({opacity:1});
    $gamePlayerCardArea.show();
    if (!MINIMAL_UI) $gamePlayerClothingArea.show();
    
    inGame = false;

	/* trigger screen refreshes */
	updateSelectionVisuals();
	updateAllGameVisuals();
    selectTitleCandy();

    forceTableVisibility(true);

	/* there is only one call to this right now */
	$epilogueSelectionModal.hide();
	$gameScreen.hide();
	$epilogueScreen.hide();
	clearEpilogue();
	$titleScreen.show();
}

/**********************************************************************
 *****                    Interaction Functions                   *****
 **********************************************************************/

/*
 * Bug Report Modal functions
 */

function getBugReportJSON() {
    var desc = $('#bug-report-desc').val();
    var type = $('#bug-report-type').val();
    var character = undefined;

    var report = compileBaseErrorReport(desc, type);
    return JSON.stringify(report);
}

function updateBugReportSendButton() {
    if($('#bug-report-desc').val().trim().length > 0) {
        $("#bug-report-modal-send-button").removeAttr('disabled');
    } else {
        $("#bug-report-modal-send-button").attr('disabled', 'true');
    }
}

$('#bug-report-desc').keyup(updateBugReportSendButton);

/* Update the bug report text dump. */
function updateBugReportOutput() {
    $('#bug-report-output').val(getBugReportJSON());
    $('#bug-report-status').text("");

    updateBugReportSendButton();
}

function copyBugReportOutput() {
    var elem = $('#bug-report-output')[0];
    elem.select();
    document.execCommand("copy");
}

function sendBugReport() {
    if($('#bug-report-desc').val().trim().length == 0) {
        $('#bug-report-status').text("Please enter a description first!");
        return false;
    }

    $.ajax({
        url: BUG_REPORTING_ENDPOINT,
        method: 'POST',
        data: getBugReportJSON(),
        contentType: 'application/json',
        error: function (jqXHR, status, err) {
            console.error("Could not send bug report - error "+status+": "+err);
            $('#bug-report-status').text("Failed to send bug report (error "+status+")");
        },
        success: function () {
            $('#bug-report-status').text("Bug report sent!");
            $('#bug-report-desc').val("");
            closeBugReportModal();
        }
    });


}

$('#bug-report-type').change(updateBugReportOutput);
$('#bug-report-desc').change(updateBugReportOutput);
$('#bug-report-copy-btn').click(copyBugReportOutput);

 /************************************************************
  * The player clicked a bug-report button. Shows the bug reports modal.
  ************************************************************/
function showBugReportModal () {
    /* Set up possible bug report types. */
    var bugReportTypes = [
        ['freeze', 'Game Freeze or Crash'],
        ['display', 'Game Graphical Problem'],
        ['other', 'Other Game Issue'],
    ]

    for (var i=1;i<5;i++) {
        if (players[i]) {
            var mixedCaseID = players[i].id.charAt(0).toUpperCase()+players[i].id.substring(1);
            bugReportTypes.push(['character:'+players[i].id, 'Character Defect ('+mixedCaseID+')']);
        }
    }

    $('#bug-report-type').empty().append(bugReportTypes.map(function (t) {
        return $('<option value="'+t[0]+'">'+t[1]+'</option>');
    }));

    $('#bug-report-modal span[data-toggle="tooltip"]').tooltip();
    updateBugReportOutput();

    KEYBINDINGS_ENABLED = false;

    $bugReportModal.modal('show');
}

function closeBugReportModal() {
    KEYBINDINGS_ENABLED = true;
    $bugReportModal.modal('hide');
}

/*
 * Show the usage tracking consent modal.
 */

function showUsageTrackingModal() {
    $usageTrackingModal.modal('show');
}

function enableUsageTracking() {
    USAGE_TRACKING = true;
    save.saveUsageTracking();
}

function disableUsageTracking() {
    USAGE_TRACKING = false;
    save.saveUsageTracking();
}

var SEMVER_RE = /[vV]?(\d+)\.(\d+)(?:\.(\d+))?(?:\-([a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-])*))?(?:\+([a-zA-Z0-9\-]+(?:\.[a-zA-Z0-9\-]+)*))?/;
function parseSemVer (versionString) {
    var m = versionString.match(SEMVER_RE);
    if (!m) return null;
    
    var ver = {
        'major': parseInt(m[1], 10) || 0,
        'minor': parseInt(m[2], 10) || 0,
        'patch': parseInt(m[3], 10) || 0,
    }
    
    if (m[4]) {
        ver.prerelease = m[4].split('.');
    }
    
    return ver;
}

/* Implements semver precedence rules, as specified in the Semantic Versioning 2.0.0 spec. */
function compareVersions (v1, v2) {
    var m1 = parseSemVer(v1);
    var m2 = parseSemVer(v2);
    
    // compare major - minor - patch first, in that order
    if (m1.major !== m2.major) return (m1.major > m2.major) ? 1 : -1;
    if (m1.minor !== m2.minor) return (m1.minor > m2.minor) ? 1 : -1;
    if (m1.patch !== m2.patch) return (m1.patch > m2.patch) ? 1 : -1;
    
    // prerelease versions always have less precedence than release versions
    if (!m1.prerelease && m2.prerelease) return 1;
    if (!m2.prerelease && m1.prerelease) return -1;
    
    // Compare pre-release identifiers from left to right
    for (var i=0;i<Math.min(m1.prerelease.length, m2.prerelease.length);i++) {
        var pr1 = parseInt(m1.prerelease[i], 10);
        var pr2 = parseInt(m2.prerelease[i], 10);
        
        if (m1.prerelease[i] !== m2.prerelease[i]) {
            // if both are numerical or both are non-numeric
            if (isNaN(pr1) === isNaN(pr2)) return (pr1 > pr2) ? 1 : -1;
            
            // otherwise, if we're comparing numeric to non-numeric,
            // numeric PR identifiers always have less precedence than non-numeric
            return isNaN(pr1) ? 1 : -1;
        }
    }
    
    // All pre-release identifiers to now compared equal
    // in this case, the version with a larger set of pre-release fields has
    // higher precedence
    if (m1.prerelease.length !== m2.prerelease.length) {
        return (m1.prerelease.length > m2.prerelease.length) ? 1 : -1;
    }
    
    // If all else fails, both versions compare equal
    return 0;
}

/************************************************************
 * The player clicked the version button. Shows the version modal.
 ************************************************************/
function showVersionModal () {
    var $changelog = $('#changelog-container');
    var entries = [];
    
    /* Get changelog info: */
    versionInfo.find('changelog > version').each(function (idx, elem) {
        entries.push({
            version: $(elem).attr('number'),
            timestamp: parseInt($(elem).attr('timestamp'), 10) || undefined,
            text: $(elem).text()
        });
    });
    
    /* Construct the version modal DOM: */
    $changelog.empty().append(entries.sort(function (e1, e2) {
        // Sort in reverse-precedence order
        return compareVersions(e1.version, e2.version) * -1;
    }).map(function (ent) {
        var row = document.createElement('tr');
        var versionCell = document.createElement('td');
        var dateCell = document.createElement('td');
        var logTextCell = document.createElement('td');
        
        versionCell.className = 'changelog-version-label';
        dateCell.className = 'changelog-date-label';
        logTextCell.className = 'changelog-entry-text';
        
        if (ent.timestamp) {
            var date = new Date(ent.timestamp);
            var locale = window.navigator.userLanguage || window.navigator.language
            dateCell.innerText = date.toLocaleDateString(locale, {month: 'long', day: 'numeric', year: 'numeric'});
        }
        
        versionCell.innerText = ent.version;
        logTextCell.innerText = ent.text;
        
        row.appendChild(versionCell);
        row.appendChild(dateCell);
        row.appendChild(logTextCell);
        
        return row;
    }));
    
    $versionModal.modal('show');
}

/************************************************************
 * The player clicked the help / FAQ button. Shows the help modal.
 ************************************************************/
function showHelpModal () {
    $helpModal.modal('show');
}

$('.help-page-select').click(function (ev) {
    var toPage = $(ev.target).attr('data-select-page');
    var curPage = $helpModal.attr('data-current-page');
    curPage = parseInt(curPage, 10) || 1;
    
    if (toPage === 'prev') {
        curPage = (curPage > 1) ? curPage-1 : 1;
    } else if (toPage === 'next') {
        curPage = (curPage < 7) ? curPage+1 : 7;
    } else {
        curPage = toPage;
    }
    
    $helpModal.attr('data-current-page', curPage);
    $('.help-page').hide();
    $('.help-page[data-page="'+curPage+'"]').show();
    $('.help-page-select').removeClass('active');
    $('.help-page-select[data-page="'+curPage+'"]').addClass('active');
})

/************************************************************
 * The player clicked the player tags button. Shows the player tags modal.
 ************************************************************/
function showPlayerTagsModal () {
    if (document.forms['player-tags'].elements.length <= 6) {
        // Safari doesn't support color inputs properly!
        var hairColorPicker = document.getElementById('hair_color_picker');
        var selectionType;
        try {
            selectionType = typeof hairColorPicker.selectionStart;
        } catch(e) {
            selectionType = null;
        }
        for (var choiceName in playerTagOptions) {
            var replace = (choiceName != 'skin_color' || selectionType === 'number');
            var $existing = $('form#player-tags [name="'+choiceName+'"]');
            if (!replace && $existing.length) continue;
            var $select = $('<select>', { name: choiceName });
            $select.append('<option>', playerTagOptions[choiceName].values.map(function(opt) {
                return $('<option>').val(opt.value).addClass(opt.gender).append(opt.text || opt.value.replace(/_/g, ' ').initCap());
            }));
            if ($existing.length) {
                $existing.parent().replaceWith($select);
            } else {
                var $label = $('<label class="player-tag-select">');
                if (playerTagOptions[choiceName].gender) {
                    $select.addClass(playerTagOptions[choiceName].gender);
                    $label.addClass(playerTagOptions[choiceName].gender);
                }
                $label.append('Choose your ' + choiceName.replace(/_/g, ' ') + ':', $select);
                $('form#player-tags').append($label);
            }
        }

        var rgb2hsv = function(rgb) {
          var r = parseInt(rgb.slice(1,3), 16)/255;
          var g = parseInt(rgb.slice(3,5), 16)/255;
          var b = parseInt(rgb.slice(5), 16)/255;

          var min = Math.min(r, Math.min(g,b));
          var max = Math.max(r, Math.max(g,b));

          if (max === 0) {
            return [0,0,0];
          }

          var maxOffset = max === r ? 0 : (max === g ? 2 : 4);
          var delta = max === r ? g-b : (max === g ? b-r : r-g);

          var h = 60 * (maxOffset + delta / (max - min));
          if (h < 0) {
            h += 360;
          }

          return [h, (max - min) / max * 100, max * 100];
        }

        /* convert the raw colors to corresponding tags and display next to selector */
        $('input[type=color]').on('input', function() {
            var h, s, v;
            [h,s,v] = rgb2hsv(this.value);

            var tag;
            color2tag:
            if (this.id === 'hair_color_picker') {
              if (v < 10) {
                tag = 'black_hair';
                break color2tag;
              }

              if (s < 25) {
                if (v < 30) {
                  tag = 'black_hair';
                } else {
                  tag = 'white_hair';
                }
                break color2tag;
              }

              if (s < 50 && h > 20 && h < 50) {
                tag = 'brunette';
                break color2tag;
              }

              if (h < 50) {
                tag = 'ginger';
              } else if (h < 65) {
                tag = 'blonde';
              } else if (h < 325) {
                if (h < 145) {
                  tag = 'green_hair';
                } else if (h < 255) {
                  tag = 'blue_hair';
                } else if (h < 290) {
                  tag = 'purple_hair';
                } else {
                  tag = 'pink_hair';
                }
              } else {
                tag = 'ginger';
              }
            } else if (this.id === 'eye_color_picker') {

              if (v < 25) {
                tag = 'dark_eyes';
                break color2tag;
              }

              if (s < 20) {
                tag = 'pale_eyes';
                break color2tag;
              }

              if (h < 15) {
                tag = 'red_eyes';
              } else if (h < 65) {
                tag = 'amber_eyes';
              } else if (h < 145) {
                tag = 'green_eyes';
              } else if (h < 255) {
                tag = 'blue_eyes';
              } else if (h < 325) {
                tag = 'violet_eyes';
              } else {
                tag = 'red_eyes';
              }
            }

            this.previousElementSibling.value = tag || '';
        });

        $('input[name=skin_color]').on('input', function() {
            for (var i = 0; i < playerTagOptions['skin_color'].values.length; i++) {
                if (this.value <= playerTagOptions['skin_color'].values[i].to) {
                    tag = playerTagOptions['skin_color'].values[i].value;
                    break;
                }
            }

            this.previousElementSibling.value = tag || '';
        });

        $('.modal-button.clearSelections').click(function() {
            var formElements = document.forms['player-tags'].elements;
            for (var i = 0; i < formElements.length; i++) {
                if (formElements[i].type !== 'color') {
                    formElements[i].value = '';
                }
            }
        });
    }

    for (var choiceName in playerTagOptions) {
        $('form#player-tags [name="'+choiceName+'"]').val(playerTagSelections[choiceName]).trigger('input');
    }
    $('#player-tags-confirm').one('click', function() {
        playerTagSelections = {};
        for (var choiceName in playerTagOptions) {
            if (!('gender' in playerTagOptions[choiceName]) || playerTagOptions[choiceName].gender == players[HUMAN_PLAYER].gender) {
                var val = $('form#player-tags [name="'+choiceName+'"]').val();
                if (val) {
                    playerTagSelections[choiceName] = val;
                }
            }
        }
    });
    $playerTagsModal.modal('show');
}

/************************************************************
 * The player clicked on a table opacity button.
 ************************************************************/
function toggleTableVisibility () {
	if (tableOpacity > 0) {
		$gameTable.fadeOut();
		tableOpacity = 0;
	} else {
		$gameTable.fadeIn();
		tableOpacity = 1;
	}
}

function forceTableVisibility(state) {
    if (!state) {
		$gameTable.fadeOut();
		tableOpacity = 0;
	} else {
		$gameTable.fadeIn();
		tableOpacity = 1;
	}
}

/************************************************************
 * The player clicked on a Load/Save button.
 ************************************************************/
function showImportModal() {
    $("#export-code").text(save.serializeLocalStorage());
    
    if (codeImportEnabled) {
        $('#import-progress').prop('disabled', false);
        $('.import-restriction-warning').hide();
    } else {
        $('#import-progress').prop('disabled', true);
        $('.import-restriction-warning').show();
    }
    
    $ioModal.modal('show');

    $('#import-progress').click(function() {
        var code = $("#export-code").val();
        save.deserializeLocalStorage(code);
    });
}

/**********************************************************************
 *****                     Utility Functions                      *****
 **********************************************************************/

/************************************************************
 * Returns a random number in a range.
 ************************************************************/
function getRandomNumber (min, max) {
	return Math.floor(Math.random() * (max - min) + min);
}

/************************************************************
 * Changes the first letter in a string to upper case.
 ************************************************************/
String.prototype.initCap = function() {
	return this.substr(0, 1).toUpperCase() + this.substr(1);
}

/************************************************************
 * Counts the number of elements that evaluate as true, or,
 * if a function is provided, passes the test implemented by it.
 ************************************************************/
Array.prototype.countTrue = function(func) {
    var count = 0;
    for (var i = 0; i < this.length; i++) {
        if (i in this
            && (func ? func(this[i], i, this) : this[i])) {
            count++;
        }
    }
    return count;
}

/************************************************************
 * Generate a random alphanumeric ID.
 ************************************************************/
function generateRandomID() {
    var ret = ''
    for (let i=0;i<10;i++) {
        ret += 'abcdefghijklmnopqrstuvwxyz1234567890'[getRandomNumber(0,36)]
    }

    return ret;
}

/**********************************************************************
 * Returns the width of the visible screen in pixels.
 **/
function getScreenWidth ()
{
	/* fetch all game screens */
	var screens = document.getElementsByClassName('screen');

	/* figure out which screen is visible */
	for (var i = 0; i < screens.length; i++)
    {
		if (screens[i].offsetWidth > 0)
        {
			/* this screen is currently visible */
			return screens[i].offsetWidth;
		}
	}
}

/**********************************************************************
 * Automatically adjusts the size of all font based on screen width.
 **/
function autoResizeFont ()
{
	/* resize font */
	var screenWidth = getScreenWidth();
	document.body.style.fontSize = (14*(screenWidth/1000))+'px';

	if (backgroundImage && backgroundImage.height && backgroundImage.width) {
		var w = window.innerWidth, h = window.innerHeight;
		if (h > (3/4) * w) {
			h = (3/4) * w;
		} else {
			w = 4 * h / 3;
		}
		var ar = backgroundImage.width / backgroundImage.height;
		if (ar > 4/3) {
			var scale = Math.sqrt(16/9 / ar);
			$("body").css("background-size", "auto " + Math.round(scale * h) + "px");
		} else {
			var scale = Math.sqrt(ar);
			$("body").css("background-size", Math.round(scale * w) + "px auto");
		}
	}
	/* set up future resizing */
	window.onresize = autoResizeFont;
}

/* Get the number of players loaded, including the human player.*/
function countLoadedOpponents() {
    return players.reduce(function (a, v) { return a + (v ? 1 : 0); }, 0);
}
