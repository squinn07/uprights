USING MIXAMO CHARACTERS AND ANIMATIONS
======================================

The game's players are its own built-in 3D figures. Mixamo files only supply
their MOVEMENT: an invisible Mixamo skeleton plays each animation and the
built-in player copies its joint angles every frame, so the players keep their
own look (uniform, pads, helmet, number) while moving like motion capture.

Download the files below from https://www.mixamo.com (free, needs an Adobe
login), save them in THIS folder with exactly these names, then double-click
tools\pack-mixamo.bat. Reload index.html afterwards. To go back to the poses
built into the code, delete the .fbx files and run the .bat again.


FILES
-----
  character.fbx   REQUIRED. Pick any character, then Download with:
                  Format "FBX Binary (.fbx)", Pose "T-pose".

  With that same character still selected, pick each animation and download it
  with Format "FBX Binary (.fbx)", Skin "Without Skin", 30 fps:

  idle.fbx        Kicker waiting.      Search: "idle"      (e.g. a breathing idle)
  kick.fbx        The kick itself.     Search: "kick"      (a soccer-style kick with a short run-up)
  kneel.fbx       Holder.              Search: "kneeling"  (a kneeling idle)
  snap.fbx        Long snapper.        Search: "hike" or "snap"
  celebrate.fbx   Optional, on a make. Search: "victory"

  Tick "In Place" wherever Mixamo offers it. (The game also removes any
  forward travel itself and moves the player along the run-up.)

Each role switches to Mixamo only when its files are present:
  kicker        needs character + idle + kick
  holder        needs character + kneel
  long snapper  needs character + snap
Anything missing keeps the built-in player for that role, so you can add them
one at a time. The officials are always built-in.


TUNING (optional)
-----------------
Create config.json in this folder to line the kick up with the ball:

  { "kickContact": 0.5, "kickSpeed": 1, "snapStart": 0.5 }

  kickContact   How far through kick.fbx the foot meets the ball, from 0 to 1.
                Normally leave this out: the game works it out from the clip
                (fastest forward swing of a foot) and starts the kicker where
                that foot will land on the ball. Set it only if the ball leaves
                too early (raise it) or too late (lower it).
  kickAngle     Direction of the run-up in radians. 0 is straight downfield,
                negative angles come in from the kicker's left, like a
                soccer-style kicker. Default -0.4.
  kickSpeed     Playback speed of the kick. 1.3 makes a slow clip snappier.
  snapStart     Seconds into snap.fbx to start playing when the ball is snapped.
                Normally leave this out: the game finds the stance, the moment
                the hands start back, and where the hands are, places the
                snapper so the ball is between them, and turns him to face the
                goal if the clip faces another way.
  snapSpeed     Playback speed of the hike. Default 1.5.
  kneelPlay     The holder normally freezes on the first frame of kneel.fbx.
                Set this to true to play the clip through from the snap instead.
  kneelStart    Seconds of kneel.fbx to skip when kneelPlay is on.

Re-run tools\pack-mixamo.bat after changing it.


GOOD TO KNOW
------------
- character.fbx is never shown; it only provides the skeleton the animations
  are made for. Any Mixamo character works.
- The holder's arms are steered onto the ball by the game (hands out for the
  snap, both hands on the catch, one on top for the hold), so any kneeling
  pose works. The fit is approximate: wrists are placed, fingers are not.
- Each file is embedded in assets\mixamo-pack.js, so a character with large
  textures makes the game slower to open.
