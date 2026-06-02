-- Harvest desktop control panel.
-- Double-clickable status + start/reload/stop monitor for the local Harvest app.
-- Compile to a .app with:  osacompile -o ~/Desktop/Harvest.app scripts/Harvest.applescript
-- All real logic lives in scripts/harvestctl.sh — this is just the clickable face.

property ctl : "/Users/leslie/CC-Income-Analyzer/scripts/harvestctl.sh"

on run
	repeat
		set theStatus to do shell script "/bin/bash " & quoted form of ctl & " status"
		set theState to do shell script "/bin/bash " & quoted form of ctl & " state"

		if theState is "ONLINE" then
			set acts to {"Reload app", "Stop app", "View logs", "Refresh", "Quit"}
		else if theState is "FAULT" then
			set acts to {"Reload app", "View logs", "Stop app", "Refresh", "Quit"}
		else
			set acts to {"Start app", "View logs", "Refresh", "Quit"}
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
		else if act is "View logs" then
			do shell script "open -a Console " & quoted form of (do shell script "/bin/bash " & quoted form of ctl & " logs")
		end if
		-- loop: re-read and show fresh status
	end repeat
end run
