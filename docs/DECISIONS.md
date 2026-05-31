# Racesweet Design Decisions

## Language choice

Typescript was opted on for a variety of reasons after a lot of consideration.

The primary reason was wanting code which could be written and run on any device.  Kotlin, Python and C would have all been more desirable mostly for performance reasons, however libraries like Electron and React ultimately made this decision.

The second strongest being wanting a language that was most likely to be workable to people who want to get involved in and pick up the project.  Today it is incredbly rare to find someone who can actually write C without introducing huge memory leaks or completely crashing the application.

Electron on React/TS rather than trying to use React Native was ultimately chosen due to UI and component library controls - ReactNative is very poor at this time when it comes to table-content, of which a passing record or result is most effectively displayed in a grid or table structure.

## Connectivity

It's imperative that when operating a timing system that you have the ability to continue to function when internet connectivity is not available.  While designing the system such that you can utilise this and even provide live timing is *a nice to have*, it is far more critical that you can both collect and process your data on the spot, and immediately, to provide a result both during an event and in remote locations, so that podiums can occur within 15 minutes of an event finish.

In cycling, it's common to have long event routes or areas within dense forest or tree areas where LTE and HSDPA services are unreliable.  At popular events - for example motorsports, or schools events where a large population may attend a usually quiet town - visiting user devices may completely saturate a mobile network.  We have also encountered events where we've found telco providers have had a scheduled outage on the day of events.  

## Data ownership

Too often services either lock the owners data behind their service, or in the event of there being an issue, there's no way of users retrieving their own raw data - either to need to manually fix due to software bugs, or because they are not provided access to those services.  We want event event owners to ultimately own their own data and have the ability to have this reside where they choose, rather than paying for a solution.

## Testing coverage policy

All feature work should include automated tests that cover create, update, and delete behavior where that behavior exists.

Required coverage for feature changes:

1. Unit tests must validate update behavior for service logic and state mutation rules.
2. Unit tests must validate create and delete behavior for service logic that owns those operations.
3. Integration tests must validate update behavior through user-visible UI or controller flows.
4. Integration tests must validate create and delete behavior through user-visible UI or controller flows.
5. Integration tests that modify state should include at least one section/panel switch to confirm rendering remains healthy after mutations.

PR checklist:

1. Added or updated unit tests for relevant create/update/delete logic.
2. Added or updated integration tests for relevant create/update/delete flows.
3. Verified state-changing integration tests still render expected controls after navigation.
