-- Harvest desktop control panel.
-- Double-clickable status + control surface for the local Harvest app: start /
-- reload / stop, nightly-agent toggle, logs, and an AI doctor (Claude) that can
-- investigate and fix faults. (Re)build with:  scripts/build-desktop-app.sh
-- (compiles, sets the icon, then re-signs LAST — a bare `osacompile` followed by
-- dropping the icon in breaks the code signature). All real logic lives in
-- scripts/harvestctl.sh — this is just the clickable face.

property ctl : "/Users/leslie/CC-Income-Analyzer/scripts/harvestctl.sh"

-- Run a harvestctl subcommand, never letting a shell error crash the panel.
on runCtl(cmd)
	try
		return do shell script "/bin/bash " & quoted form of ctl & " " & cmd
	on error errMsg
		return "ERROR: " & errMsg
	end try
end runCtl

-- Open a file path (returned by a harvestctl subcommand) in Console.app.
on openInConsole(pathCmd)
	set p to runCtl(pathCmd)
	if p does not start with "ERROR" and p is not "" then
		try
			do shell script "open -a Console " & quoted form of p
		end try
	end if
end openInConsole

on run
	-- Guard: the control script must exist, or there's nothing to drive.
	tell application "System Events"
		if not (exists file ctl) then
			display dialog "Harvest control script not found:" & return & ctl & return & return & "Reinstall or rebuild the app." buttons {"Quit"} default button "Quit" with icon stop
			return
		end if
	end tell

	repeat
		set theStatus to runCtl("status")
		set theState to runCtl("state")

		-- Nightly upgrade agent on/off — label reflects current state.
		set agentState to runCtl("agent-state")
		if agentState is "ON" then
			set agentItem to "Nightly agent: ON — turn off"
		else
			set agentItem to "Nightly agent: OFF — turn on"
		end if

		-- Menu order adapts to health: when faulting, lead with the AI fix.
		if theState is "ONLINE" then
			set acts to {"Reload app", "Investigate & fix (Claude)", "Diagnose (Claude)", "Stop app", agentItem, "View logs", "View doctor report", "Refresh", "Quit"}
		else if theState is "FAULT" then
			set acts to {"Investigate & fix (Claude)", "Diagnose (Claude)", "Reload app", "View logs", "Stop app", agentItem, "View doctor report", "Refresh", "Quit"}
		else
			set acts to {"Start app", "Investigate & fix (Claude)", "Diagnose (Claude)", agentItem, "View logs", "View doctor report", "Refresh", "Quit"}
		end if

		set picked to (choose from list acts with title "Harvest" with prompt theStatus default items {item 1 of acts} OK button name "Run" cancel button name "Close")
		if picked is false then exit repeat
		set act to (item 1 of picked)

		if act is "Quit" then
			exit repeat
		else if act is "Start app" then
			display notification (runCtl("start")) with title "Harvest"
		else if act is "Stop app" then
			display notification (runCtl("stop")) with title "Harvest"
		else if act is "Reload app" then
			display notification (runCtl("reload")) with title "Harvest"
		else if act is "Investigate & fix (Claude)" then
			set msg to runCtl("doctor")
			if msg starts with "ERROR" then
				display dialog msg buttons {"OK"} default button "OK" with icon caution
			else
				display notification msg with title "Harvest — Claude doctor"
				openInConsole("doctor-log")
			end if
		else if act is "Diagnose (Claude)" then
			set msg to runCtl("diagnose")
			if msg starts with "ERROR" then
				display dialog msg buttons {"OK"} default button "OK" with icon caution
			else
				display notification msg with title "Harvest — Claude doctor"
				openInConsole("doctor-log")
			end if
		else if act starts with "Nightly agent" then
			display notification (runCtl("agent-toggle")) with title "Harvest"
		else if act is "View logs" then
			openInConsole("logs")
		else if act is "View doctor report" then
			openInConsole("doctor-summary")
		end if
		-- loop: re-read and show fresh status
	end repeat
end run
