import { BehaviorSubject, of, Subject, from, race, merge } from 'rxjs'
import { map, withLatestFrom, mergeMap, filter, tap } from 'rxjs/operators'

export class RxQueue<T> {
  public queue: T[] = []
  public out$ = new Subject<T>()
  public pushed = 0
  public sended = 0
  public awaited = 0

  constructor(values?: T[]) {
    if (values) this.queue = this.queue.concat(values)
  }

  public get isEmpty() {
    return this.queue.length === 0
  }
  public get size() {
    return this.queue.length
  }

  public push(value: T) {
    if (this.out$.closed) return
    if (this.awaited > 0) {
      this.awaited--
      this.out$.next(value)
      this.sended++
    } else {
      this.queue.push(value)
    }
    this.pushed++
    return this
  }

  public next() {
    if (this.out$.closed) return
    if (!this.isEmpty) {
      const value = this.queue.shift()
      this.out$.next(value)
      this.sended++
      return value
    } else {
      this.awaited++
    }
  }

  subscribe = this.out$.subscribe.bind(this.out$)
  pipe = this.out$.pipe.bind(this.out$)
  complete = this.out$.complete.bind(this.out$)
  error = this.out$.error.bind(this.out$)

  public waitForNext = (): Promise<T> => {
    return new Promise(resolve => {
      const sub = this.out$.subscribe(value => {
        sub.unsubscribe()
        resolve(value)
      })
    })
  }
}

export class TriggerSubject<T> extends Subject<T> {
  public queue: T[] = []
  private awaited = 0

  public get isEmpty() {
    return this.queue.length === 0
  }
  public get size() {
    return this.queue.length
  }

  public next(value: T) {
    if (this.closed) return
    if (this.awaited > 0) {
      this.awaited--
      super.next(value)
    } else {
      this.queue.push(value)
    }
  }

  public putFirst(value: T) {
    if (this.closed) return
    if (this.awaited > 0) {
      this.awaited--
      super.next(value)
    } else {
      this.queue.unshift(value)
    }
  }

  public trigger() {
    if (this.closed) return
    if (!this.isEmpty) {
      const value = this.queue.shift()
      super.next(value)
      return value
    } else {
      this.awaited++
    }
  }

  public waitForTrigger = (): Promise<T> => {
    return new Promise(resolve => {
      const sub = this.subscribe(value => {
        sub.unsubscribe()
        resolve(value)
      })
    })
  }
}

type DeferedAction = [ expr: (s: string) => boolean, action: string ]

class Dispatcher {
  private state$ = new BehaviorSubject<string>('INITIAL')
  private action$ = new TriggerSubject<string>()
  // private deferedAction$ = new RxQueue2<string>()

  private waitForStateList: DeferedAction[] = []

  // private waitUntilState = (state: string): Promise<void> => {
  //   console.log('waitUntilState begin')
  //   return new Promise(resolve => {
  //     const sub = this.state$.pipe(filter(s => s === state)).subscribe(s => {
  //       console.log('waitUntilState end')
  //       sub.unsubscribe()
  //       resolve()
  //     })
  //   })
  // }

  private defer(fn: (...args: any) => void, ...args: any) {
    fn.apply(this, args)
  }

  private deferUntil(type: string, expr: (s: string) => boolean) {
    console.log('----push waiting list')
    this.waitForStateList.push([expr, type])
  }

  public dispatch = async (type: string, state: string) => {
    console.log(`\n\n>>> action ${type} (state: ${state})`)
    switch (type) {
      case 'SET_LONG':
        if (state !== 'READY') {
          this.deferUntil(type, s => s === 'READY')
          return state
        }
        return 'STATE_LONG'
      case 'SET_READY':
        return 'READY'
      case 'SET_SHORT':
        return 'STATE_SHORT'
    }
    return state
  }

  public action(a: string) {
    console.log('IN ACTION', a)
    this.action$.next(a)
  }

  private handleStateChange = (newState: string) => {
    console.log(`----check defered action queue`, this.waitForStateList.map(v => v[1]))
    for (let i = 0; i < this.waitForStateList.length; i++) {
      const [expr, type] = this.waitForStateList[i]
      if (expr(newState)) {
        this.waitForStateList.splice(i, 1)
        this.action$.putFirst(type)
        console.log('----found defered task and put it at first', this.action$.queue)
        break
      }
    }
    console.log(`@@@ ${this.state$.value} => ${newState} @@@ \n\n\n`)
    this.state$.next(newState)
    
  }

  constructor() {
    this.action$
      .pipe(
        withLatestFrom(this.state$),
        mergeMap(([a, s]) => from(this.dispatch(a, s))),
      )
      .subscribe(this.handleStateChange)

    this.state$.subscribe(s => {
      console.log('----trigger next', this.action$.queue)
      this.action$.trigger()
    })
  }
}

async function main() {
  const d = new Dispatcher()
  d.action('SET_LONG')
  d.action('SET_SHORT')
  d.action('SET_LONG')
  d.action('SET_READY')
  d.action('SET_SHORT')
  d.action('SET_READY')
}

main()
