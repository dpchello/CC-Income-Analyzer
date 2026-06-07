-- Harvest desktop control panel.
-- Double-clickable status + start/reload/stop monitor for the local Harvest app.
-- (Re)build with:  scripts/build-desktop-app.sh   (compiles, sets the icon, then
-- re-signs LAST — a bare `osacompile` followed by dropping the icon in breaks the
-- code signature). All real logic lives in scripts/harvestctl.sh — this is just
-- the clickable face.

property ctl : "/Users/leslie/CC-Income-Analyzer/scripts/harvestctl.sh"

on run
	repeat
		set theStatus to do shell script "/bin/bash " & quoted form of ctl & " status"
		set theState to do shell script "/bin/bash " & quoted form of ctl & " state"

		-- Nightly upgrade agent on/off — label reflects current state.
		set agentState to do shell script "/bin/bash " & quoted form of ctl & " agent-state"
		if agentState is "ON" then
			set agentItem to "Nightly agent: ON — turn off"
		else
			set agentItem to "Nightly agent: OFF — turn on"
		end if

		if theState is "ONLINE" then
			set acts to {"Reload app", "Stop app", agentItem, "View logs", "Refresh", "Quit"}
		else if theState is "FAULT" then
			set acts to {"Reload app", "View logs", agentItem, "Stop app", "Refresh", "Quit"}
		else
			set acts to {"Start app", agentItem, "View logs", "Refresh", "Quit"}
		end if

		set picked to (choose from list acts with title "Harvest" with prompt theStatus default items {item 1 of acts} OK button name "Run" cancel button name "Close")
		if picked is false then exit repeat
		set act to (item 1 of picked)

		if act is "Quit" then
			exit repeat
		else if act is "Start app" then
			display notification (do shell script "/bin/bash " & quoted form of ctl & " start") with title "Harvest"
		else if act is "Stop app" then
			display notification (do shell script "/bin/bash " & quoted form of ctl & " stop") with title "Harvest"
		else if act is "Reload app" then
			display notification (do shell script "/bin/bash " & quoted form of ctl & " reload") with title "Harvest"
		else if act starts with "Nightly agent" then
			display notification (do shell script "/bin/bash " & quoted form of ctl & " agent-toggle") with title "Harvest"
		else if act is "View logs" then
			do shell script "open -a Console " & quoted form of (do shell script "/bin/bash " & quoted form of ctl & " logs")
		end if
		-- loop: re-read and show fresh status
	end repeat
end run
